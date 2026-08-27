import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, Habit, HabitCheck, ScheduleBlock, Session } from '@/lib/types'
import { listGoals } from '@/services/goals'
import { listHabitChecksInRange, listHabits, setHabitCheck } from '@/services/habits'
import { habitTarget, habitsDueOn } from '@/domain/habits'
import {
  createEvent,
  deleteEvent,
  listEventsInRange,
  setEventDone,
  updateEvent,
  type EventInput,
} from '@/services/events'
import { WEEKDAY_LABELS, groupByDate, inSameMonth, monthGrid, weekDays } from '@/domain/calendar'
import {
  WEEKDAY_PLURALS,
  minutesToTime,
  preferredStartTime,
  rangeMinutes,
  timeToMinutes,
} from '@/domain/commitment'
import {
  assignEventsToSessions,
  eventSpan,
  gridBounds,
  layoutDay,
  rangeLabel,
  sessionSpan,
  uncoveredGaps,
  type AgendaSpan,
  type GridPlacement,
} from '@/domain/agenda'
import { dueBlocksForDate } from '@/domain/sessions'
import { listScheduleForUser, updateBlockStartTime } from '@/services/schedule'
import {
  createSpontaneousSession,
  deleteSession,
  listSessionsInRange,
  setSessionPlannedTime,
} from '@/services/sessions'
import { nicheAccent } from '@/lib/nicheAccent'
import { friendlyError } from '@/lib/errors'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/lib/formDraft'
import {
  addDays,
  addMonths,
  dayOfMonth,
  formatDuration,
  formatMonthYear,
  formatTime12,
  formatWeekday,
  formatWeekRange,
  isToday,
  todayISO,
} from '@/lib/date'
import { LoadingScreen } from '@/components/LoadingScreen'
import {
  IconArrowReturn,
  IconBack,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconFlag,
  IconPlay,
  IconPlus,
} from '@/components/icons'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { NicheIcon } from '@/components/NicheGlyph'
import { useToast } from '@/app/toast'
import { Hint } from '@/components/Hint'
import { sessionCache } from '@/lib/sessionCache'
import { useCacheMirror } from '@/hooks/useCacheMirror'

type View = 'day' | 'week' | 'month'

/** Instantánea de datos cacheada por sesión (por rango de fechas) para pintar al instante. */
type CalSnapshot = {
  events: CalendarEvent[]
  goals: Goal[]
  blocks: ScheduleBlock[]
  sessions: Session[]
  habits: Habit[]
  habitChecks: HabitCheck[]
}

/** Una repetición de un hábito tal como se ve en la agenda de un día. */
interface DayHabitItem {
  key: string
  habit: Habit
  /** Índice de la repetición (0 si el hábito no tiene horas). */
  slot: number
  /** Repeticiones totales del día (para el sufijo "2/5"). */
  target: number
  /** Hora de esta repetición, o null si el hábito no tiene hora. */
  time: string | null
  done: boolean
}

/** Una sesión tal como se ve en la agenda: real (fila en BD) o proyectada del compromiso. */
interface DayAgendaSession {
  key: string
  goal: Goal
  time: string | null
  /** Rango horario del bloque (fin derivado solo para compromisos de tiempo). */
  span: AgendaSpan
  state: 'pending' | 'running' | 'done' | 'partial' | 'missed' | 'unconfirmed' | 'projected'
  targetLabel: string
  session: Session | null
  block: ScheduleBlock | null
}

/**
 * Qué compromete la sesión, en lenguaje de la agenda: "4 h", "25 min" o la
 * cantidad con su unidad. La hora de fin ya no va aquí: vive en la columna
 * de hora del bloque (sessionSpan).
 */
function agendaTargetLabel(kind: Session['targetKind'], value: number, unit: string | null): string {
  if (kind !== 'time') return `${value} ${unit ?? ''}`.trim()
  return formatDuration(value)
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
  const suggestedTime = preferredStartTime(profile.preferredMoment)

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
  const [habits, setHabits] = useState<Habit[]>(cached?.habits ?? [])
  const [habitChecks, setHabitChecks] = useState<HabitCheck[]>(cached?.habitChecks ?? [])
  // block null = sesión espontánea (una sola fecha, sin recurrencia): se le pone
  // hora a esa sesión y se puede quitar. block presente = compromiso recurrente.
  const [timeSheet, setTimeSheet] = useState<{ goal: Goal; block: ScheduleBlock | null; session: Session | null } | null>(null)
  const [ready, setReady] = useState(cached !== undefined)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{
    event: CalendarEvent | null
    date: string
    /** Prefijado "Con horario" al tocar un hueco libre de la grilla. */
    presetStart?: string
    presetEnd?: string
  } | null>(null)
  // Bloque de sesión abierto en su hoja (plan, quick-add y acción principal).
  const [blockSheet, setBlockSheet] = useState<{ sessionKey: string; day: string } | null>(null)
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
        const [evs, gs, blks, sess, habs, checks] = await Promise.all([
          listEventsInRange(userId, from, to),
          listGoals(userId),
          listScheduleForUser(userId),
          listSessionsInRange(userId, from, to),
          // Hábitos con tolerancia a fallos: la agenda sigue sirviendo sin ellos.
          listHabits(userId).catch(() => [] as Habit[]),
          listHabitChecksInRange(userId, from, to).catch(() => [] as HabitCheck[]),
        ])
        if (!active) return
        setEvents(evs)
        setGoals(gs)
        setBlocks(blks)
        setSessions(sess)
        setHabits(habs)
        setHabitChecks(checks)
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
    habits,
    habitChecks,
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
        span: sessionSpan(s.plannedTime, s.targetKind, s.targetValue),
        state: s.status,
        targetLabel: agendaTargetLabel(s.targetKind, s.targetValue, s.unit),
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
          span: sessionSpan(b.startTime, b.targetKind, b.targetValue),
          state: 'projected',
          targetLabel: agendaTargetLabel(b.targetKind, b.targetValue, b.unit),
          session: null,
          block: b,
        })
      }
    }
    return items.sort((a, b2) => (a.time ?? '99').localeCompare(b2.time ?? '99'))
  }

  /**
   * Repeticiones de hábitos que tocan en un día: solo hábitos activos cuyo
   * weekday aplica; una fila por repetición (una sola, sin hora, si no tiene
   * times). El slot i corresponde a times[i].
   */
  function dayHabits(day: string): DayHabitItem[] {
    const items: DayHabitItem[] = []
    for (const h of habitsDueOn(habits, day)) {
      const target = habitTarget(h)
      for (let slot = 0; slot < target; slot++) {
        items.push({
          key: `h-${h.id}-${day}-${slot}`,
          habit: h,
          slot,
          target,
          time: h.times?.[slot] ?? null,
          done: habitChecks.some((c) => c.habitId === h.id && c.date === day && c.slot === slot),
        })
      }
    }
    return items
  }

  /** Alterna el check de UNA repetición desde la agenda (optimista, con revert). */
  async function toggleHabitSlot(it: DayHabitItem, day: string) {
    const check: HabitCheck = { habitId: it.habit.id, date: day, slot: it.slot }
    const add = !it.done
    const without = (list: HabitCheck[]) =>
      list.filter((c) => !(c.habitId === check.habitId && c.date === day && c.slot === it.slot))
    setHabitChecks((prev) => (add ? [...prev, check] : without(prev)))
    try {
      await setHabitCheck(userId, it.habit.id, day, add, it.slot)
    } catch {
      setHabitChecks((prev) => (add ? without(prev) : [...prev, check]))
      toast('No se pudo marcar el hábito.')
    }
  }

  /**
   * Marca o desmarca un evento como hecho (optimista, con revert). El estado
   * `events` alimenta el mirror del cache, así que el toggle también persiste
   * en la instantánea de sesión.
   */
  async function toggleEventDone(e: CalendarEvent) {
    const done = !e.doneAt
    const optimistic = done ? new Date().toISOString() : null
    setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, doneAt: optimistic } : x)))
    try {
      const updated = await setEventDone(e.id, done)
      setEvents((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (err) {
      setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, doneAt: e.doneAt } : x)))
      const friendly =
        err instanceof Error && (err as Error & { code?: string }).code === 'missing-column'
          ? err.message
          : 'No se pudo marcar el evento.'
      toast(friendly)
    }
  }

  function handleSession(it: DayAgendaSession, day: string) {
    // Todo bloque abre su hoja: ahí viven el plan (checklist + quick-add) y la
    // acción según estado (cronómetro, detalle de solo lectura o fijar hora).
    setBlockSheet({ sessionKey: it.key, day })
  }

  async function saveSessionTime(time: string | null) {
    const ts = timeSheet
    setTimeSheet(null)
    if (!ts) return
    try {
      if (ts.block) {
        // Compromiso recurrente: la hora se fija para todos los días del bloque.
        const updatedBlock = await updateBlockStartTime(ts.block.id, time)
        setBlocks((prev) => prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)))
      }
      if (ts.session) {
        const updatedSession = await setSessionPlannedTime(ts.session.id, time)
        setSessions((prev) => prev.map((sx) => (sx.id === updatedSession.id ? updatedSession : sx)))
      }
      toast(
        !time
          ? 'Hora quitada.'
          : ts.block
            ? `Listo: todos los ${WEEKDAY_PLURALS[ts.block.weekday]} a las ${formatTime12(time)}.`
            : `Hora fijada: ${formatTime12(time)}.`,
        'success',
      )
    } catch {
      toast('No se pudo guardar la hora.')
    }
  }

  /** Quita una sesión espontánea agregada desde la agenda. */
  async function removeSession() {
    const ts = timeSheet
    setTimeSheet(null)
    if (!ts?.session) return
    const removed = ts.session
    setSessions((prev) => prev.filter((sx) => sx.id !== removed.id))
    try {
      await deleteSession(removed.id)
      toast('Sesión quitada.', 'success')
    } catch {
      setSessions((prev) => [...prev, removed])
      toast('No se pudo quitar la sesión.')
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

  /** Toca un hueco libre → editor "Con horario" prellenado al inicio del hueco. */
  function planGap(day: string, gapStartMin: number, gapEndMin: number) {
    const start = Math.ceil(gapStartMin / 30) * 30 // redondeo a :00/:30 hacia arriba
    const end = Math.min(start + 60, gapEndMin) // +1 h sin pasarse del hueco
    setEditing({
      event: null,
      date: day,
      presetStart: minutesToTime(start),
      presetEnd: minutesToTime(end),
    })
  }

  /** Quick-add de la hoja de bloque: crea el evento ya vinculado a la meta. */
  async function quickAddPlanItem(
    goalId: string,
    date: string,
    title: string,
    time: string | null,
  ) {
    const created = await createEvent(userId, {
      title,
      date,
      allDay: !time,
      startTime: time,
      endTime: null,
      goalId,
      notes: null,
    })
    setEvents((prev) => [...prev, created].filter((e) => e.date >= from && e.date <= to))
  }

  async function removeEditingEvent() {
    const current = editing?.event
    if (!current) return
    await deleteEvent(current.id)
    setEvents((prev) => prev.filter((e) => e.id !== current.id))
    setEditing(null)
    toast('Evento borrado.')
  }

  // Orientación temporal del día seleccionado (vista día y panel de día del mes):
  // deja claro si estás mirando el pasado (lo que hiciste) o el futuro (planificar).
  const dayContextBanner = selected !== today && (
    <div
      className={`alert${selected > today ? ' faint' : ''}`}
      role="status"
      style={selected < today ? { background: 'var(--primary-soft)' } : undefined}
    >
      {selected < today
        ? 'Estás viendo un día pasado: esto fue lo que hiciste.'
        : 'Día futuro: lo que agregues aquí queda planificado.'}{' '}
      <button type="button" className="btn--link" onClick={goToday}>
        Volver a hoy
      </button>
    </div>
  )

  const headerTitle =
    view === 'day'
      ? formatWeekday(selected)
      : view === 'week'
        ? formatWeekRange(week[0], week[6])
        : formatMonthYear(anchor)

  const dayProps = (day: string) => ({
    day,
    sessions: daySessions(day),
    onSession: (it: DayAgendaSession) => handleSession(it, day),
    habits: dayHabits(day),
    onHabit: (it: DayHabitItem) => void toggleHabitSlot(it, day),
    events: eventsByDate.get(day) ?? [],
    deadlines: deadlinesByDate.get(day) ?? [],
    goalById,
    onAdd: () => setEditing({ event: null, date: day }),
    onOpen: (e: CalendarEvent) => setEditing({ event: e, date: e.date }),
    onToggleEvent: (e: CalendarEvent) => void toggleEventDone(e),
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
                      {habitsDueOn(habits, day).length > 0 && <span className="cal-dot cal-dot--habit" />}
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
          <div className="cal-month__day stack">
            {dayContextBanner}
            <DayTimeGrid {...dayProps(selected)} onGap={(s, e) => planGap(selected, s, e)} />
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="stack cal-week">
          {week.map((day) => (
            <DaySection key={day} {...dayProps(day)} />
          ))}
        </div>
      ) : (
        <div className="stack">
          {dayContextBanner}
          <DayTimeGrid {...dayProps(selected)} onGap={(s, e) => planGap(selected, s, e)} />
        </div>
      )}

      {timeSheet && (
        <TimeSheet
          goal={timeSheet.goal}
          block={timeSheet.block}
          session={timeSheet.session}
          suggested={suggestedTime}
          onClose={() => setTimeSheet(null)}
          onSave={(t) => void saveSessionTime(t)}
          onDelete={timeSheet.session && !timeSheet.block ? () => void removeSession() : undefined}
        />
      )}

      {blockSheet &&
        (() => {
          // La hoja se deriva del estado vivo: los checks y el quick-add se
          // reflejan al instante; si la sesión desaparece, la hoja se cierra sola.
          const list = daySessions(blockSheet.day)
          const it = list.find((s) => s.key === blockSheet.sessionKey)
          if (!it) return null
          const { nested } = assignEventsToSessions(
            list.map((s) => ({
              key: s.key,
              goalId: s.goal.id,
              start: s.span.start,
              end: s.span.end,
            })),
            eventsByDate.get(blockSheet.day) ?? [],
          )
          return (
            <BlockSheet
              key={blockSheet.sessionKey}
              it={it}
              sub={nested.get(it.key) ?? []}
              onClose={() => setBlockSheet(null)}
              onToggleEvent={(e) => void toggleEventDone(e)}
              onOpenEvent={(e) => {
                setBlockSheet(null)
                setEditing({ event: e, date: e.date })
              }}
              onQuickAdd={async (title, time) => {
                try {
                  await quickAddPlanItem(it.goal.id, blockSheet.day, title, time)
                } catch {
                  toast('No se pudo agregar al plan.')
                }
              }}
              onOpenSession={(s) => {
                setBlockSheet(null)
                navigate(`/sesion/${s.id}`)
              }}
              onSetTime={() => {
                setBlockSheet(null)
                setTimeSheet({ goal: it.goal, block: it.block, session: it.session })
              }}
            />
          )
        })()}

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
          suggested={suggestedTime}
          presetStart={editing.presetStart}
          presetEnd={editing.presetEnd}
          onClose={() => setEditing(null)}
          onSubmit={submitEvent}
          onDelete={removeEditingEvent}
        />
      )}
    </div>
  )
}

/** Columna de hora a dos líneas: inicio en bold y, si se puede derivar, fin tenue. */
function TimeColumn({ span, fallback }: { span: AgendaSpan; fallback: string }) {
  return (
    <span className="ev__time">
      {span.start ? formatTime12(span.start) : fallback}
      {span.start && span.end && <span className="ev__time-end">{formatTime12(span.end)}</span>}
    </span>
  )
}

/** Check circular para marcar un evento de la agenda como hecho. */
function EventCheck({ event, onToggle }: { event: CalendarEvent; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`check check--sm${event.doneAt ? ' check--done' : ''}`}
      onClick={onToggle}
      aria-pressed={Boolean(event.doneAt)}
      aria-label={`${event.doneAt ? 'Desmarcar' : 'Marcar como hecho'} “${event.title}”`}
    >
      <IconCheck size={12} />
    </button>
  )
}

/** Estados que ya no admiten cronómetro (la sesión quedó cerrada). */
const CLOSED_STATES = ['done', 'partial', 'missed']
/** Estados de una sesión real de HOY que llevan directo al cronómetro. */
const OPEN_STATUSES = ['pending', 'running', 'unconfirmed']

/** ¿Sesión real de hoy, todavía abierta? (la que invita a darle play). */
function isOpenToday(it: DayAgendaSession): boolean {
  return Boolean(
    it.session && it.session.date === todayISO() && OPEN_STATUSES.includes(it.session.status),
  )
}

/** Aria-label de un bloque de sesión: qué es y qué pasa al tocarlo. */
function sessionAriaLabel(it: DayAgendaSession): string {
  const range = it.span.start ? `, de ${rangeLabel(it.span.start, it.span.end)}` : ''
  if (it.session && isOpenToday(it)) return `Abrir la sesión de ${it.goal.title}${range}`
  if (it.session) {
    return `Ver el detalle de la sesión de ${it.goal.title}, ${sessionStateLabel(it.state)}${range}`
  }
  return `Sesión de ${it.goal.title}, ${sessionStateLabel(it.state)}${range}`
}

/** Indicio de tocable: play (hoy, abierta) o chevron (todo lo demás). */
function SessionGoIcon({ it }: { it: DayAgendaSession }) {
  const play = isOpenToday(it)
  return (
    <span className={`ev-go${play ? ' ev-go--play' : ''}`} aria-hidden="true">
      {play ? <IconPlay size={12} /> : <IconChevronRight size={14} />}
    </span>
  )
}

/** Tag de estado de sesión; el "hecha" celebra con el check en verde. */
function SessionStateTag({ state }: { state: DayAgendaSession['state'] }) {
  return (
    <span className={`tag${state === 'done' ? ' tag--done' : ''}`}>
      {state === 'done' && <IconCheck size={11} />} {sessionStateLabel(state)}
    </span>
  )
}

/** Fila de la sub-checklist de un bloque (la lista y la hoja la comparten). */
function EventSubRow({
  e,
  onOpen,
  onToggle,
}: {
  e: CalendarEvent
  onOpen: (e: CalendarEvent) => void
  onToggle: (e: CalendarEvent) => void
}) {
  return (
    <li className={`ev-sub${e.doneAt ? ' ev-sub--done' : ''}`}>
      <EventCheck event={e} onToggle={() => onToggle(e)} />
      <span className="ev-sub__time">
        {!e.allDay && e.startTime ? formatTime12(e.startTime) : '—'}
      </span>
      <button type="button" className="ev-sub__title" onClick={() => onOpen(e)}>
        {e.title}
      </button>
    </li>
  )
}

/** Bloque de sesión en formato lista (vista semana y sección "Sin hora"). */
function SessionRow({
  it,
  sub,
  onSession,
  onOpen,
  onToggleEvent,
}: {
  it: DayAgendaSession
  sub: CalendarEvent[]
  onSession: (it: DayAgendaSession) => void
  onOpen: (e: CalendarEvent) => void
  onToggleEvent: (e: CalendarEvent) => void
}) {
  const isClosed = CLOSED_STATES.includes(it.state)
  const doneCount = sub.filter((e) => e.doneAt).length
  // Dieta de info: lo normal (pendiente / comprometida) no se etiqueta.
  const showState = it.state !== 'pending' && it.state !== 'projected'
  const head = (
    <>
      <TimeColumn span={it.span} fallback="—" />
      <span className="ev__body">
        <span className="ev__title">{it.goal.title}</span>
        <span className="ev__meta">
          {showState && <SessionStateTag state={it.state} />}
          <span className="faint tiny">{it.targetLabel}</span>
          {sub.length > 0 && (
            <span className="tag">
              {doneCount}/{sub.length}
            </span>
          )}
        </span>
      </span>
      <SessionGoIcon it={it} />
    </>
  )
  if (sub.length === 0) {
    return (
      <button
        className={`ev ev--session${isClosed ? ' ev--closed' : ''}`}
        style={nicheAccent(it.goal.area)}
        onClick={() => onSession(it)}
        aria-label={sessionAriaLabel(it)}
      >
        {head}
      </button>
    )
  }
  return (
    <div
      className={`ev ev--session ev--block${isClosed ? ' ev--closed' : ''}`}
      style={nicheAccent(it.goal.area)}
    >
      <button
        type="button"
        className="ev-block__head"
        onClick={() => onSession(it)}
        aria-label={sessionAriaLabel(it)}
      >
        {head}
      </button>
      <ul className="ev__sublist">
        {sub.map((e) => (
          <EventSubRow key={e.id} e={e} onOpen={onOpen} onToggle={onToggleEvent} />
        ))}
      </ul>
    </div>
  )
}

/** Repetición de hábito en formato lista. */
function HabitRow({ it, onHabit }: { it: DayHabitItem; onHabit: (it: DayHabitItem) => void }) {
  return (
    <button
      className={`ev ev--session${it.done ? ' ev--habit-done' : ''}`}
      style={nicheAccent(it.habit.area)}
      onClick={() => onHabit(it)}
      aria-pressed={it.done}
      aria-label={`${it.done ? 'Desmarcar' : 'Marcar'} el hábito ${it.habit.title}${
        it.target > 1 ? `, repetición ${it.slot + 1} de ${it.target}` : ''
      }`}
    >
      <span className="ev__time">{it.time ? formatTime12(it.time) : '—'}</span>
      <span className="ev__body">
        <span className="ev__title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--niche)', display: 'inline-flex', flex: 'none' }}>
            <NicheIcon area={it.habit.area} size={14} />
          </span>
          {it.habit.title}
          {it.target > 1 && (
            <span className="tag">
              {it.slot + 1}/{it.target}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

/** Evento suelto en formato lista. */
function EventRow({
  e,
  goal,
  onOpen,
  onToggle,
}: {
  e: CalendarEvent
  goal: Goal | null
  onOpen: (e: CalendarEvent) => void
  onToggle: (e: CalendarEvent) => void
}) {
  const notePreview = e.notes ? e.notes.trim().split('\n')[0] : null
  const span = eventSpan(e)
  const minutes = span.start && span.end ? rangeMinutes(span.start, span.end) : null
  return (
    <div className={`ev${e.doneAt ? ' ev--done' : ''}`}>
      <TimeColumn span={span} fallback="Día" />
      <button type="button" className="ev__open" onClick={() => onOpen(e)}>
        <span className="ev__body">
          <span className="ev__title">{e.title}</span>
          {(goal || notePreview || minutes != null) && (
            <span className="ev__meta">
              {minutes != null && <span className="faint tiny">{formatDuration(minutes)}</span>}
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
      <EventCheck event={e} onToggle={() => onToggle(e)} />
    </div>
  )
}

/** Props que comparten la lista de día (semana) y la grilla horaria. */
interface DayCommonProps {
  day: string
  sessions: DayAgendaSession[]
  onSession: (it: DayAgendaSession) => void
  habits: DayHabitItem[]
  onHabit: (it: DayHabitItem) => void
  events: CalendarEvent[]
  deadlines: Goal[]
  goalById: Map<string, Goal>
  onAdd: () => void
  onOpen: (e: CalendarEvent) => void
  /** Marcar/desmarcar un evento como hecho (dentro o fuera de un bloque). */
  onToggleEvent: (e: CalendarEvent) => void
  onGoal: (g: Goal) => void
  /** Sumar una sesión espontánea este día (solo hoy o futuro, con metas activas). */
  onPlanSession?: () => void
}

/** Un día como lista apilada. Lo conserva la vista semana. */
function DaySection({
  day,
  sessions,
  onSession,
  habits,
  onHabit,
  events,
  deadlines,
  goalById,
  onAdd,
  onOpen,
  onToggleEvent,
  onGoal,
  onPlanSession,
}: DayCommonProps) {
  const empty =
    sessions.length === 0 && habits.length === 0 && events.length === 0 && deadlines.length === 0

  // Los eventos de una meta con sesión este día viven DENTRO de su bloque;
  // el resto queda suelto en la línea de tiempo.
  const { nested, standalone } = assignEventsToSessions(
    sessions.map((s) => ({ key: s.key, goalId: s.goal.id, start: s.span.start, end: s.span.end })),
    events,
  )

  // Una sola línea de tiempo: bloques de sesión, repeticiones de hábitos y
  // eventos sueltos se ordenan juntos por hora. Los eventos de día completo
  // van primero y lo que no tiene hora al final, como hasta ahora.
  type DayListItem =
    | { kind: 'session'; sort: string; session: DayAgendaSession }
    | { kind: 'habit'; sort: string; habitItem: DayHabitItem }
    | { kind: 'event'; sort: string; event: CalendarEvent }
  const timeline: DayListItem[] = [
    ...standalone.map((e) => ({
      kind: 'event' as const,
      sort: e.allDay || !e.startTime ? '' : e.startTime,
      event: e,
    })),
    ...sessions.map((s) => ({ kind: 'session' as const, sort: s.time ?? '99', session: s })),
    ...habits.map((h) => ({ kind: 'habit' as const, sort: h.time ?? '99', habitItem: h })),
  ].sort((a, b) => a.sort.localeCompare(b.sort))

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
          {timeline.map((item) =>
            item.kind === 'session' ? (
              <SessionRow
                key={item.session.key}
                it={item.session}
                sub={nested.get(item.session.key) ?? []}
                onSession={onSession}
                onOpen={onOpen}
                onToggleEvent={onToggleEvent}
              />
            ) : item.kind === 'habit' ? (
              <HabitRow key={item.habitItem.key} it={item.habitItem} onHabit={onHabit} />
            ) : (
              <EventRow
                key={item.event.id}
                e={item.event}
                goal={item.event.goalId ? (goalById.get(item.event.goalId) ?? null) : null}
                onOpen={onOpen}
                onToggle={onToggleEvent}
              />
            ),
          )}
          {deadlines.map((g) => (
            <button key={`d-${g.id}`} className="ev ev--goal" onClick={() => onGoal(g)}>
              <span
                className="ev__time"
                style={{ display: 'inline-flex', justifyContent: 'flex-start' }}
              >
                <IconFlag size={14} className="muted" />
              </span>
              <span className="ev__title">
                Meta: {g.title} <span className="faint tiny">· fecha objetivo</span>
              </span>
            </button>
          ))}
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

/** "7 am", "12 pm" — etiqueta corta del eje horario. */
function axisHourLabel(min: number): string {
  const h = Math.floor(min / 60) % 24
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${h >= 12 ? 'pm' : 'am'}`
}

/** "2 h libres": mismo redondeo que gapLabel, en plural para el botón de hueco. */
function freeLabel(minutes: number): string {
  const rounded = minutes >= 120 ? Math.round(minutes / 30) * 30 : minutes
  return `${formatDuration(rounded)} libres`
}

/**
 * Vista día como grilla horaria real (1 px = 1 min): las horas libres se VEN
 * como espacio vacío y, en días planificables, son botones para llenarlas.
 * La usan la vista día y el panel del día seleccionado del mes.
 */
function DayTimeGrid({
  day,
  sessions,
  onSession,
  habits,
  onHabit,
  events,
  deadlines,
  goalById,
  onAdd,
  onOpen,
  onToggleEvent,
  onGoal,
  onPlanSession,
  onGap,
}: DayCommonProps & {
  /** Planear algo en un hueco libre (solo hoy/futuro; sin esto no hay botones). */
  onGap?: (startMin: number, endMin: number) => void
}) {
  const { nested, standalone } = assignEventsToSessions(
    sessions.map((s) => ({ key: s.key, goalId: s.goal.id, start: s.span.start, end: s.span.end })),
    events,
  )

  const timedSessions = sessions.filter((s) => s.span.start !== null)
  const untimedSessions = sessions.filter((s) => s.span.start === null)
  const timedHabits = habits.filter((h) => h.time !== null)
  const untimedHabits = habits.filter((h) => h.time === null)
  const allDayEvents = standalone.filter((e) => e.allDay)
  const timedEvents = standalone.filter((e) => !e.allDay && e.startTime)
  const untimedEvents = standalone.filter((e) => !e.allDay && !e.startTime)

  const gridItems = [
    ...timedSessions.map((s) => ({ key: s.key, start: s.span.start as string, end: s.span.end })),
    ...timedHabits.map((h) => ({ key: h.key, start: h.time as string, end: null })),
    ...timedEvents.map((e) => {
      const sp = eventSpan(e)
      return { key: e.id, start: sp.start as string, end: sp.end }
    }),
  ]
  const bounds = gridBounds(gridItems)
  const placed = new Map(layoutDay(gridItems).map((p) => [p.key, p] as const))
  // Huecos accionables solo donde se planifica (hoy/futuro); en días pasados
  // el vacío se ve igual, sin botones.
  const gaps = onGap && day >= todayISO() ? uncoveredGaps(gridItems, bounds) : []

  const hourMarks: number[] = []
  for (let m = bounds.startMin; m <= bounds.endMin; m += 60) hourMarks.push(m)

  /** Posiciona por minutos relativos a la ventana (top/height via CSS vars). */
  const at = (startMin: number, endMin: number, extra?: CSSProperties): CSSProperties =>
    ({
      ...extra,
      '--is': startMin - bounds.startMin,
      '--ie': endMin - bounds.startMin,
    }) as CSSProperties
  /** Posiciona y reparte el ancho según el carril del clúster de solape. */
  const laneAt = (p: GridPlacement, extra?: CSSProperties): CSSProperties =>
    ({
      ...at(p.startMin, p.endMin, extra),
      '--lane': p.lane,
      '--lanes': p.lanes,
    }) as CSSProperties

  const untimedCount = untimedSessions.length + untimedHabits.length + untimedEvents.length

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

      {(deadlines.length > 0 || allDayEvents.length > 0) && (
        <div className="tg-allday">
          {deadlines.map((g) => (
            <button
              key={`d-${g.id}`}
              type="button"
              className="tg-chip"
              onClick={() => onGoal(g)}
              aria-label={`Meta ${g.title}, fecha objetivo`}
            >
              <span className="tg-chip__flag">
                <IconFlag size={12} />
              </span>
              <span className="tg-chip__title">{g.title}</span>
            </button>
          ))}
          {allDayEvents.map((e) => (
            <div key={e.id} className={`tg-chip${e.doneAt ? ' tg-chip--done' : ''}`}>
              <EventCheck event={e} onToggle={() => onToggleEvent(e)} />
              <button type="button" className="tg-chip__title" onClick={() => onOpen(e)}>
                {e.title}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="tg" style={{ '--tg-span': bounds.endMin - bounds.startMin } as CSSProperties}>
        {hourMarks.map((m) => (
          <div
            key={m}
            className="tg__hour"
            style={{ '--m': m - bounds.startMin } as CSSProperties}
            aria-hidden="true"
          >
            <span className="tg__hour-label">{axisHourLabel(m)}</span>
          </div>
        ))}
        <div className="tg__items">
          {gaps.map((g) => (
            <button
              key={`g-${g.startMin}`}
              type="button"
              className="tg-gap"
              style={at(g.startMin, g.endMin)}
              onClick={() => onGap?.(g.startMin, g.endMin)}
              aria-label={`Planear algo de ${formatTime12(minutesToTime(g.startMin))} a ${formatTime12(minutesToTime(g.endMin))}`}
            >
              {freeLabel(g.endMin - g.startMin)}
            </button>
          ))}

          {timedSessions.map((it) => {
            const p = placed.get(it.key)
            if (!p) return null
            const sub = nested.get(it.key) ?? []
            const isClosed = CLOSED_STATES.includes(it.state)
            const showState = it.state !== 'pending' && it.state !== 'projected'
            const doneCount = sub.filter((e) => e.doneAt).length
            return (
              <button
                key={it.key}
                className={`tg-item tg-item--session${isClosed ? ' tg-item--closed' : ''}`}
                style={laneAt(p, nicheAccent(it.goal.area))}
                onClick={() => onSession(it)}
                aria-label={sessionAriaLabel(it)}
              >
                <SessionGoIcon it={it} />
                <span className="tg-item__title">{it.goal.title}</span>
                <span className="tg-item__range">
                  {rangeLabel(it.span.start as string, it.span.end)} · {it.targetLabel}
                </span>
                {(showState || sub.length > 0) && (
                  <span className="tg-item__meta">
                    {showState && <SessionStateTag state={it.state} />}
                    {sub.length > 0 && (
                      <span className="tag">
                        {doneCount}/{sub.length}
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}

          {timedHabits.map((it) => {
            const p = placed.get(it.key)
            if (!p) return null
            return (
              <button
                key={it.key}
                className={`tg-item tg-item--habit${it.done ? ' tg-item--done' : ''}`}
                style={laneAt(p, nicheAccent(it.habit.area))}
                onClick={() => onHabit(it)}
                aria-pressed={it.done}
                aria-label={`${it.done ? 'Desmarcar' : 'Marcar'} el hábito ${it.habit.title}${
                  it.target > 1 ? `, repetición ${it.slot + 1} de ${it.target}` : ''
                }`}
              >
                <span className="tg-item__time">{formatTime12(it.time as string)}</span>
                <span style={{ color: 'var(--niche)', display: 'inline-flex', flex: 'none' }}>
                  <NicheIcon area={it.habit.area} size={13} />
                </span>
                <span className="tg-item__title tg-item__title--row">{it.habit.title}</span>
                {it.target > 1 && (
                  <span className="tag">
                    {it.slot + 1}/{it.target}
                  </span>
                )}
              </button>
            )
          })}

          {timedEvents.map((e) => {
            const p = placed.get(e.id)
            if (!p) return null
            const span = eventSpan(e)
            return (
              <div
                key={e.id}
                className={`tg-item tg-item--event${e.doneAt ? ' tg-item--done' : ''}`}
                style={laneAt(p)}
              >
                <button type="button" className="tg-item__open" onClick={() => onOpen(e)}>
                  <span className="tg-item__title">{e.title}</span>
                  <span className="tg-item__range">
                    {rangeLabel(span.start as string, span.end)}
                  </span>
                </button>
                <EventCheck event={e} onToggle={() => onToggleEvent(e)} />
              </div>
            )
          })}
        </div>
      </div>

      {untimedCount > 0 && (
        <div className="stack stack--sm">
          <p className="tg-untimed">Sin hora</p>
          {untimedSessions.map((it) => (
            <SessionRow
              key={it.key}
              it={it}
              sub={nested.get(it.key) ?? []}
              onSession={onSession}
              onOpen={onOpen}
              onToggleEvent={onToggleEvent}
            />
          ))}
          {untimedHabits.map((it) => (
            <HabitRow key={it.key} it={it} onHabit={onHabit} />
          ))}
          {untimedEvents.map((e) => (
            <EventRow
              key={e.id}
              e={e}
              goal={e.goalId ? (goalById.get(e.goalId) ?? null) : null}
              onOpen={onOpen}
              onToggle={onToggleEvent}
            />
          ))}
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

/**
 * Hoja de un bloque de sesión: el plan del bloque (checklist de eventos de la
 * meta), un quick-add para sumarle cosas sin abrir el editor completo, y la
 * acción principal según el estado (cronómetro, detalle o fijar la hora).
 */
function BlockSheet({
  it,
  sub,
  onClose,
  onToggleEvent,
  onOpenEvent,
  onQuickAdd,
  onOpenSession,
  onSetTime,
}: {
  it: DayAgendaSession
  sub: CalendarEvent[]
  onClose: () => void
  onToggleEvent: (e: CalendarEvent) => void
  onOpenEvent: (e: CalendarEvent) => void
  onQuickAdd: (title: string, time: string | null) => Promise<void>
  onOpenSession: (s: Session) => void
  onSetTime: () => void
}) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const isClosed = CLOSED_STATES.includes(it.state)
  const showState = it.state !== 'pending' && it.state !== 'projected'
  const openToday = isOpenToday(it)

  async function submitQuickAdd(e: FormEvent) {
    e.preventDefault()
    const clean = title.trim()
    if (!clean || adding) return
    setAdding(true)
    try {
      await onQuickAdd(clean, time || null)
      setTitle('')
      setTime('')
    } finally {
      setAdding(false)
      // El foco se queda en el input: meter cinco cosas seguidas debe fluir.
      inputRef.current?.focus()
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="sheet__panel stack stack--lg"
        style={nicheAccent(it.goal.area)}
      >
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{it.goal.title}</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>
        <p className="small muted bsheet__when">
          {it.span.start ? `${rangeLabel(it.span.start, it.span.end)} · ` : ''}
          {it.targetLabel}
          {showState && <SessionStateTag state={it.state} />}
        </p>

        <div className="stack stack--sm">
          {sub.length > 0 && (
            <ul className="ev__sublist bsheet__list">
              {sub.map((e) => (
                <EventSubRow key={e.id} e={e} onOpen={onOpenEvent} onToggle={onToggleEvent} />
              ))}
            </ul>
          )}
          <form className="bsheet__add" onSubmit={(e) => void submitQuickAdd(e)}>
            <input
              ref={inputRef}
              className="input"
              placeholder="Agregar al plan…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="done"
            />
            <input
              className="input bsheet__add-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Hora (opcional)"
            />
            <button
              type="submit"
              className="iconbtn"
              disabled={!title.trim() || adding}
              aria-label="Agregar al plan"
            >
              <IconPlus size={18} />
            </button>
          </form>
        </div>

        {it.session ? (
          <button
            className="btn btn--primary btn--block"
            onClick={() => onOpenSession(it.session as Session)}
          >
            {openToday
              ? it.session.status === 'running'
                ? 'Continuar la sesión'
                : 'Empezar ahora'
              : 'Ver el detalle de la sesión'}
          </button>
        ) : (
          <button className="btn btn--primary btn--block" onClick={onSetTime}>
            Fijar la hora
          </button>
        )}
        {it.session && !isClosed && (
          <button className="btn btn--ghost btn--block" onClick={onSetTime}>
            Cambiar la hora
          </button>
        )}
      </div>
    </div>
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
  session,
  suggested,
  onClose,
  onSave,
  onDelete,
}: {
  goal: Goal
  /** null = sesión espontánea de una sola fecha; presente = compromiso recurrente. */
  block: ScheduleBlock | null
  session: Session | null
  /** Hora sugerida según el momento preferido del perfil (editable). */
  suggested: string | null
  onClose: () => void
  onSave: (time: string | null) => void
  /** Solo para sesiones espontáneas: permite quitarlas. */
  onDelete?: () => void
}) {
  const initialTime = block?.startTime ?? session?.plannedTime ?? suggested ?? ''
  const [time, setTime] = useState(initialTime)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  const target = block ?? session
  const hadTime = block ? block.startTime : session?.plannedTime
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
          Sesión de <strong>{goal.title}</strong>
          {block ? ` · todos los ${WEEKDAY_PLURALS[block.weekday]}` : ' · solo este día'}
          {target &&
            ` · ${target.targetKind === 'time' ? formatDuration(target.targetValue) : `${target.targetValue} ${target.unit ?? ''}`}`}
        </p>
        <input
          className="input"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Hora de la sesión"
        />
        {target?.targetKind === 'time' && time && (
          <p className="faint tiny" style={{ margin: 0 }} aria-live="polite">
            Quedaría {rangeLabel(time, sessionSpan(time, target.targetKind, target.targetValue).end)}
            . La duración se ajusta desde el detalle de la meta.
          </p>
        )}
        <button className="btn btn--primary btn--block" disabled={!time} onClick={() => onSave(time)}>
          {block ? `Guardar para todos los ${WEEKDAY_PLURALS[block.weekday]}` : 'Guardar la hora'}
        </button>
        {hadTime && (
          <button className="btn btn--ghost btn--block" onClick={() => onSave(null)}>
            Quitar hora
          </button>
        )}
        {onDelete && (
          <button className="btn btn--ghost btn--block" onClick={onDelete}>
            Quitar esta sesión
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
  suggested,
  presetStart,
  presetEnd,
  onClose,
  onSubmit,
  onDelete,
}: {
  initial: CalendarEvent | null
  date: string
  goals: Goal[]
  /** Hora sugerida según el momento preferido del perfil (para prellenar horario). */
  suggested: string | null
  /** Al crear desde un hueco libre: arranca "Con horario" con estas horas. */
  presetStart?: string
  presetEnd?: string
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
  // El preset de un hueco libre solo aplica al CREAR (initial null): arranca
  // "Con horario" con el inicio del hueco. Un borrador guardado siempre gana.
  const [allDay, setAllDay] = useState(
    typeof draft?.allDay === 'boolean' ? draft.allDay : (initial?.allDay ?? !presetStart),
  )
  const [startTime, setStartTime] = useState(
    typeof draft?.startTime === 'string'
      ? draft.startTime
      : (initial?.startTime ?? (initial ? '' : (presetStart ?? ''))),
  )
  const [endTime, setEndTime] = useState(
    typeof draft?.endTime === 'string'
      ? draft.endTime
      : (initial?.endTime ?? (initial ? '' : (presetEnd ?? ''))),
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

  /** Fija la hora de inicio y, si el fin está vacío, lo prellena a inicio + 1 h. */
  function pickStartTime(value: string) {
    setStartTime(value)
    if (value && !endTime) {
      const endMin = timeToMinutes(value) + 60
      // Sin envolver a la madrugada siguiente: el rango debe seguir siendo válido.
      setEndTime(endMin >= 24 * 60 ? '23:59' : minutesToTime(endMin))
    }
  }

  /**
   * Pasa a "Con horario". Si aún no hay hora de inicio, la prellenamos con algo
   * razonable (siempre editable): la siguiente hora en punto si el evento es hoy,
   * o la hora sugerida del perfil si existe.
   */
  function enableSchedule() {
    setAllDay(false)
    if (startTime) return
    if (eventDate === todayISO()) {
      const nextHour = Math.min(new Date().getHours() + 1, 23) * 60
      pickStartTime(minutesToTime(nextHour))
    } else if (suggested) {
      pickStartTime(suggested)
    }
  }

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
              onClick={enableSchedule}
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
                  onChange={(e) => pickStartTime(e.target.value)}
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
