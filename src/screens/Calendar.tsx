import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { CalendarEvent, Goal, Habit, HabitCheck, ScheduleBlock, Session } from '@/lib/types'
import { listGoals } from '@/services/goals'
import {
  clearHabitDayOverride,
  listHabitChecksInRange,
  listHabitOverridesInRange,
  listHabits,
  setHabitCheck,
  setHabitDayTimes,
  type HabitDayOverride,
} from '@/services/habits'
import { habitDayRow, habitTogglePlan, habitWithDayTimes, habitsDueOn } from '@/domain/habits'
import {
  createEvent,
  deleteEvent,
  listEventsInRange,
  setEventDone,
  updateEvent,
  type EventInput,
} from '@/services/events'
import { WEEKDAY_LABELS, groupByDate, inSameMonth, monthGrid, weekDays } from '@/domain/calendar'
import { WEEKDAY_PLURALS, minutesToTime, preferredStartTime, timeToMinutes } from '@/domain/commitment'
import { assignEventsToSessions, rangeLabel, sessionSpan } from '@/domain/agenda'
import {
  CLOSED_STATES,
  agendaTargetLabel,
  isOpenToday,
  sessionStateLabel,
  weekDaySummary,
  type DayAgendaSession,
} from '@/screens/calendar/agendaItems'
import { EventCheck } from '@/screens/calendar/EventCheck'
import { DayAgenda } from '@/screens/calendar/DayAgenda'
import { WeekDay } from '@/screens/calendar/WeekDay'
import { AddSheet } from '@/screens/calendar/AddSheet'
import type { DayHabitRowItem } from '@/screens/calendar/agendaItems'
import { dueBlocksForDate } from '@/domain/sessions'
import { listScheduleForUser, updateBlockStartTime } from '@/services/schedule'
import {
  createSpontaneousSession,
  deleteSession,
  generateSessionsForDate,
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
  IconBack,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconPencil,
  IconPlus,
} from '@/components/icons'
import { Sheet } from '@/components/Sheet'
import { NicheIcon } from '@/components/NicheGlyph'
import { useToast } from '@/app/toast'
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
  habitOverrides: HabitDayOverride[]
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
  // En escritorio la semana abre todos los días (hay espacio); en móvil, solo hoy.
  const [desktop] = useState(() => {
    try {
      return window.matchMedia('(min-width: 1024px)').matches
    } catch {
      return false
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
  // Excepciones "día reorganizado" (0015): horas de hábitos SOLO de una fecha.
  const [habitOverrides, setHabitOverrides] = useState<HabitDayOverride[]>(
    cached?.habitOverrides ?? [],
  )
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
  // Día abierto en la hoja "Reorganizar el día" (horas solo de esa fecha).
  const [reorganizing, setReorganizing] = useState<string | null>(null)
  // Día para el que se está sumando una sesión espontánea desde la agenda.
  const [planning, setPlanning] = useState<string | null>(null)
  // Día para el que se abrió la hoja del "+".
  const [adding, setAdding] = useState<string | null>(null)
  // Reloj de la línea "Ahora": un tick por minuto alcanza.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  // A qué rango pertenecen los datos actuales: al cambiar de mes sin recargar aún, evita
  // reflejar datos del mes anterior bajo la clave del nuevo rango.
  const loadedKeyRef = useRef<string | null>(cached !== undefined ? cacheKey : null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setError(null)
        const [evs, gs, blks, sess, habs, checks, ovr] = await Promise.all([
          listEventsInRange(userId, from, to),
          listGoals(userId),
          listScheduleForUser(userId),
          listSessionsInRange(userId, from, to),
          // Hábitos con tolerancia a fallos: la agenda sigue sirviendo sin ellos.
          listHabits(userId).catch(() => [] as Habit[]),
          listHabitChecksInRange(userId, from, to).catch(() => [] as HabitCheck[]),
          listHabitOverridesInRange(userId, from, to).catch(() => [] as HabitDayOverride[]),
        ])
        if (!active) return
        setEvents(evs)
        setGoals(gs)
        setBlocks(blks)
        setSessions(sess)
        setHabits(habs)
        setHabitChecks(checks)
        setHabitOverrides(ovr)
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
    habitOverrides,
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

  /** Excepción de horario de un hábito para esa fecha, si existe. */
  function overrideFor(habitId: string, day: string): HabitDayOverride | null {
    return habitOverrides.find((o) => o.habitId === habitId && o.date === day) ?? null
  }

  /** Hábitos que tocan en un día: UNA fila por hábito, con las horas efectivas de esa fecha. */
  function dayHabitRows(day: string): DayHabitRowItem[] {
    const effective = habits.map((h) => habitWithDayTimes(h, overrideFor(h.id, day)))
    return habitsDueOn(effective, day).map((h) => ({
      key: `h-${h.id}-${day}`,
      habit: h,
      ...habitDayRow(h, habitChecks, day),
    }))
  }

  /** Marca la siguiente repetición (o desmarca la última) desde la agenda; optimista, con revert. */
  async function toggleHabitRow(it: DayHabitRowItem, day: string) {
    const { slot, add } = habitTogglePlan(it.habit, habitChecks, day)
    const check: HabitCheck = { habitId: it.habit.id, date: day, slot }
    const without = (list: HabitCheck[]) =>
      list.filter((c) => !(c.habitId === check.habitId && c.date === day && c.slot === slot))
    setHabitChecks((prev) => (add ? [...prev, check] : without(prev)))
    try {
      await setHabitCheck(userId, it.habit.id, day, add, slot)
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
    else if (view === 'week') {
      setAnchor((a) => addDays(a, dir * 7))
      setSelected((s) => addDays(s, dir * 7))
    } else setAnchor((a) => addMonths(a, dir))
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

  /**
   * Fija la hora de UNA sesión solo ese día (hoja "Reorganizar"). Una
   * proyectada se materializa primero con generateSessionsForDate (misma
   * materialización que usa Hoy), así el bloque recurrente no se toca.
   */
  async function setDaySessionTime(it: DayAgendaSession, day: string, time: string | null) {
    let session = it.session
    if (!session && it.block) {
      const generated = await generateSessionsForDate(userId, day, [it.block])
      setSessions((prev) => {
        const known = new Set(prev.map((s) => s.id))
        return [...prev, ...generated.filter((s) => !known.has(s.id))]
      })
      session = generated.find((s) => s.scheduleId === it.block?.id && s.date === day) ?? null
    }
    if (!session) return
    const updated = await setSessionPlannedTime(session.id, time)
    setSessions((prev) => prev.map((sx) => (sx.id === updated.id ? updated : sx)))
  }

  /** Guarda las horas de un hábito SOLO para esa fecha (excepción 0015). */
  async function saveHabitDayTimes(habitId: string, day: string, times: string[]) {
    await setHabitDayTimes(userId, habitId, day, times)
    setHabitOverrides((prev) => [
      ...prev.filter((o) => !(o.habitId === habitId && o.date === day)),
      { habitId, date: day, times },
    ])
  }

  /** Quita la excepción del día: el hábito vuelve a su horario de siempre. */
  async function clearHabitOverride(habitId: string, day: string) {
    await clearHabitDayOverride(habitId, day)
    setHabitOverrides((prev) => prev.filter((o) => !(o.habitId === habitId && o.date === day)))
  }

  /** Mueve el inicio de un evento desplazando el fin el mismo delta. */
  async function saveEventStart(e: CalendarEvent, start: string) {
    const delta = timeToMinutes(start) - timeToMinutes(e.startTime as string)
    let end: string | null = e.endTime
    if (end) {
      const raw = timeToMinutes(end) + delta
      // Sin envolver a la madrugada: el rango debe seguir siendo válido.
      end = raw >= 24 * 60 ? '23:59' : raw <= timeToMinutes(start) ? null : minutesToTime(raw)
    }
    const updated = await updateEvent(e.id, {
      title: e.title,
      date: e.date,
      allDay: false,
      startTime: start,
      endTime: end,
      goalId: e.goalId,
      notes: e.notes,
    })
    setEvents((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  /** Toca un hueco libre → editor "Con horario" prellenado al inicio del hueco. */
  function planGap(day: string, gapStartMin: number, gapEndMin: number) {
    const start = Math.ceil(gapStartMin / 5) * 5 // al múltiplo de 5 min siguiente
    // +1 h sin pasarse del hueco ni envolver a la madrugada siguiente.
    const end = Math.min(start + 60, gapEndMin, 24 * 60 - 1)
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
    habits: dayHabitRows(day),
    events: eventsByDate.get(day) ?? [],
    deadlines: deadlinesByDate.get(day) ?? [],
    goalById,
    onSession: (it: DayAgendaSession) => handleSession(it, day),
    onHabit: (it: DayHabitRowItem) => void toggleHabitRow(it, day),
    onOpenEvent: (e: CalendarEvent) => setEditing({ event: e, date: e.date }),
    onToggleEvent: (e: CalendarEvent) => void toggleEventDone(e),
    onGoal: (g: Goal) => navigate(`/metas/${g.id}`),
    onPlanAt: day >= today ? (s: number, e: number) => planGap(day, s, e) : undefined,
    now: day === today ? now : undefined,
  })

  return (
    <div className="screen">
      <header className="screen__header ag-hdr">
        <div>
          <p className="muted small">Tu agenda</p>
          <h1 className="screen__title">{headerTitle}</h1>
        </div>
        <div className="row row--sm ag-hdr__actions">
          {selected >= today && (
            <button
              className="iconbtn iconbtn--sm"
              onClick={() => setReorganizing(selected)}
              aria-label="Reorganizar el día"
              title="Reorganizar el día"
            >
              <IconPencil size={16} />
            </button>
          )}
          <button className="iconbtn iconbtn--sm" onClick={() => setAdding(selected)} aria-label="Agregar">
            <IconPlus size={18} />
          </button>
        </div>
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
            <IconChevronRight size={24} />
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
            <p className={`cal-day__label${isToday(selected) ? ' cal-day__label--today' : ''}`}>
              {formatWeekday(selected)}
            </p>
            <DayAgenda {...dayProps(selected)} />
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="stack cal-week">
          {week.map((day) => {
            const props = dayProps(day)
            return (
              <WeekDay
                key={day}
                day={day}
                summary={weekDaySummary({
                  day,
                  today,
                  sessions: props.sessions,
                  habits: props.habits,
                  events: props.events,
                  deadlines: props.deadlines,
                })}
                defaultOpen={desktop || day === today}
                selected={day === selected}
                onSelect={(d) => selectDay(d)}
              >
                <DayAgenda {...props} />
              </WeekDay>
            )
          })}
        </div>
      ) : (
        <div className="stack">
          {dayContextBanner}
          <DayAgenda {...dayProps(selected)} />
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

      {reorganizing &&
        (() => {
          const day = reorganizing
          return (
            <ReorganizeSheet
              key={day}
              day={day}
              sessions={daySessions(day).filter((s) => !CLOSED_STATES.includes(s.state))}
              habitRows={habitsDueOn(habits, day).map((h) => ({
                habit: h,
                effective: habitWithDayTimes(h, overrideFor(h.id, day)),
                hasOverride: overrideFor(h.id, day) !== null,
              }))}
              events={(eventsByDate.get(day) ?? []).filter((e) => !e.allDay && e.startTime)}
              onClose={() => setReorganizing(null)}
              onSessionTime={(it, time) => setDaySessionTime(it, day, time)}
              onHabitTimes={(habitId, times) => saveHabitDayTimes(habitId, day, times)}
              onClearHabit={(habitId) => clearHabitOverride(habitId, day)}
              onEventTime={(e, start) => saveEventStart(e, start)}
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

      {adding && (
        <AddSheet
          date={adding}
          canPlanSession={adding >= today && activeGoals.length > 0}
          onEvent={() => {
            const day = adding
            setAdding(null)
            setEditing({ event: null, date: day })
          }}
          onSession={() => {
            const day = adding
            setAdding(null)
            setPlanning(day)
          }}
          onClose={() => setAdding(null)}
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
    <Sheet onClose={onClose} label={it.goal.title} style={nicheAccent(it.goal.area)}>
      {(close) => (
        <>
          <div className="row row--between">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{it.goal.title}</h2>
            <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
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
        </>
      )}
    </Sheet>
  )
}

/** Una fila de hábito en la hoja de reorganizar: el base y el efectivo del día. */
interface ReorganizeHabitRow {
  habit: Habit
  effective: Habit
  hasOverride: boolean
}

/**
 * Hoja "Reorganizar el día": cambia con clicks las horas de sesiones, hábitos
 * y eventos SOLO de esa fecha. Las sesiones usan su hora planificada (las
 * proyectadas se materializan), los hábitos guardan una excepción (0015) y
 * los eventos se desplazan completos. La rutina de siempre no se toca.
 */
function ReorganizeSheet({
  day,
  sessions,
  habitRows,
  events,
  onClose,
  onSessionTime,
  onHabitTimes,
  onClearHabit,
  onEventTime,
}: {
  day: string
  sessions: DayAgendaSession[]
  habitRows: ReorganizeHabitRow[]
  events: CalendarEvent[]
  onClose: () => void
  onSessionTime: (it: DayAgendaSession, time: string | null) => Promise<void>
  onHabitTimes: (habitId: string, times: string[]) => Promise<void>
  onClearHabit: (habitId: string) => Promise<void>
  onEventTime: (e: CalendarEvent, start: string) => Promise<void>
}) {
  const { toast } = useToast()
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(sessions.map((s) => [s.key, s.time ?? ''])),
  )
  const [habitDrafts, setHabitDrafts] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      habitRows.map((r) => [
        r.habit.id,
        r.effective.times && r.effective.times.length > 0 ? [...r.effective.times] : [''],
      ]),
    ),
  )
  const [eventDrafts, setEventDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(events.map((e) => [e.id, e.startTime ?? ''])),
  )
  const [saving, setSaving] = useState(false)

  const empty = sessions.length === 0 && habitRows.length === 0 && events.length === 0

  const sessionChanged = (s: DayAgendaSession) => (sessionDrafts[s.key] ?? '') !== (s.time ?? '')
  /** Horas finales del hábito: un input vacío conserva su hora original. */
  const habitTimesOf = (r: ReorganizeHabitRow): string[] => {
    const base = r.effective.times ?? []
    const draft = habitDrafts[r.habit.id] ?? []
    if (base.length === 0) {
      const t = draft[0] ?? ''
      return t ? [t] : []
    }
    return base.map((orig, i) => draft[i] || orig)
  }
  const habitChanged = (r: ReorganizeHabitRow) => {
    const base = [...(r.effective.times ?? [])].sort()
    const next = [...habitTimesOf(r)].sort()
    return base.join(',') !== next.join(',')
  }
  const eventChanged = (e: CalendarEvent) =>
    Boolean(eventDrafts[e.id]) && eventDrafts[e.id] !== e.startTime

  const dirty =
    sessions.some(sessionChanged) || habitRows.some(habitChanged) || events.some(eventChanged)

  /**
   * Aplica solo lo modificado, en secuencia. Al primer error se detiene: el
   * de migración pendiente (`missing-column`) muestra SU mensaje una vez; los
   * demás, el genérico. La hoja solo se cierra si todo salió (y se va animada:
   * guardar no desmonta la hoja, el cierre es nuestro).
   */
  async function save(close: () => void) {
    if (saving || !dirty) return
    setSaving(true)
    try {
      for (const s of sessions) {
        if (!sessionChanged(s)) continue
        await onSessionTime(s, sessionDrafts[s.key] || null)
      }
      for (const r of habitRows) {
        if (!habitChanged(r)) continue
        await onHabitTimes(r.habit.id, habitTimesOf(r))
      }
      for (const e of events) {
        if (!eventChanged(e)) continue
        await onEventTime(e, eventDrafts[e.id])
      }
      toast('Día reorganizado.', 'success')
      close()
    } catch (err) {
      const code = (err as Error & { code?: string }).code
      toast(
        code === 'missing-column' ? (err as Error).message : 'No se pudo reorganizar el día.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function clearOverride(r: ReorganizeHabitRow) {
    try {
      await onClearHabit(r.habit.id)
      // El borrador vuelve a las horas de SIEMPRE (las del hábito base).
      setHabitDrafts((prev) => ({
        ...prev,
        [r.habit.id]:
          r.habit.times && r.habit.times.length > 0 ? [...r.habit.times] : [''],
      }))
      toast('Volvió a su horario de siempre.', 'success')
    } catch {
      toast('No se pudo quitar la excepción.')
    }
  }

  return (
    <Sheet onClose={onClose} label={`Reorganizar el ${formatWeekday(day)}`}>
      {(close) => (
        <>
          <div className="row row--between">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>Reorganizar el {formatWeekday(day)}</h2>
            <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
              <IconClose />
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Cambia las horas SOLO de este día. Tu rutina de siempre no se toca.
          </p>

          {empty && <p className="faint small">Nada con hora que reorganizar este día.</p>}

          {sessions.length > 0 && (
            <div className="stack stack--sm">
              <p className="reorg-kicker">Sesiones</p>
              {sessions.map((s) => (
                <div key={s.key} className="reorg-row" style={nicheAccent(s.goal.area)}>
                  <span className="reorg-row__icon">
                    <NicheIcon area={s.goal.area} size={14} />
                  </span>
                  <span className="reorg-row__label">{s.goal.title}</span>
                  <input
                    className="input reorg-row__time"
                    type="time"
                    value={sessionDrafts[s.key] ?? ''}
                    onChange={(e) =>
                      setSessionDrafts((prev) => ({ ...prev, [s.key]: e.target.value }))
                    }
                    aria-label={`Hora de la sesión de ${s.goal.title}`}
                  />
                </div>
              ))}
            </div>
          )}

          {habitRows.length > 0 && (
            <div className="stack stack--sm">
              <p className="reorg-kicker">Hábitos</p>
              {habitRows.map((r) => {
                const drafts = habitDrafts[r.habit.id] ?? ['']
                return (
                  <div key={r.habit.id} className="reorg-habit" style={nicheAccent(r.habit.area)}>
                    {drafts.map((t, i) => (
                      <div key={i} className="reorg-row">
                        <span className="reorg-row__icon">
                          {i === 0 && <NicheIcon area={r.habit.area} size={14} />}
                        </span>
                        <span className="reorg-row__label">
                          {i === 0 ? (
                            r.habit.title
                          ) : (
                            <span className="faint">Repetición {i + 1}</span>
                          )}
                        </span>
                        <input
                          className="input reorg-row__time"
                          type="time"
                          value={t}
                          onChange={(e) =>
                            setHabitDrafts((prev) => ({
                              ...prev,
                              [r.habit.id]: drafts.map((x, j) => (j === i ? e.target.value : x)),
                            }))
                          }
                          aria-label={`Hora de ${r.habit.title}${
                            drafts.length > 1 ? `, repetición ${i + 1}` : ''
                          }`}
                        />
                      </div>
                    ))}
                    {r.hasOverride && (
                      <button
                        type="button"
                        className="btn--link reorg-clear"
                        onClick={() => void clearOverride(r)}
                      >
                        Volver a su horario de siempre
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {events.length > 0 && (
            <div className="stack stack--sm">
              <p className="reorg-kicker">Eventos</p>
              {events.map((e) => (
                <div key={e.id} className="reorg-row">
                  <span className="reorg-row__label">{e.title}</span>
                  <input
                    className="input reorg-row__time"
                    type="time"
                    value={eventDrafts[e.id] ?? ''}
                    onChange={(ev) =>
                      setEventDrafts((prev) => ({ ...prev, [e.id]: ev.target.value }))
                    }
                    aria-label={`Hora de inicio de ${e.title}`}
                  />
                </div>
              ))}
            </div>
          )}

          {!empty && (
            <button
              className="btn btn--primary btn--block"
              disabled={!dirty || saving}
              onClick={() => void save(close)}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
        </>
      )}
    </Sheet>
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
  return (
    <Sheet onClose={onClose} label="¿A qué meta le sumas una sesión?">
      {(close) => (
        <>
          <div className="row row--between">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿A qué meta le sumas una sesión?</h2>
            <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
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
        </>
      )}
    </Sheet>
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
  const target = block ?? session
  const hadTime = block ? block.startTime : session?.plannedTime
  return (
    <Sheet onClose={onClose} label="¿A qué hora te queda cómodo?">
      {(close) => (
        <>
          <div className="row row--between">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿A qué hora te queda cómodo?</h2>
            <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
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
        </>
      )}
    </Sheet>
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
  // Cerrar a propósito (✕, fondo, Escape, arrastre) tira el borrador: lo corre
  // la hoja cuando termina su animación de salida.
  function discardDraft() {
    clearFormDraft(draftKey)
    onClose()
  }

  useEffect(() => {
    saveFormDraft(draftKey, { title, eventDate, allDay, startTime, endTime, goalId, notes })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, eventDate, allDay, startTime, endTime, goalId, notes])

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
    <Sheet
      onClose={discardDraft}
      label={initial ? 'Editar evento' : 'Nuevo evento'}
      as="form"
      onSubmit={handleSubmit}
    >
      {(close) => (
        <>
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
        </>
      )}
    </Sheet>
  )
}
