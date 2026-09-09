import type { CalendarEvent, Goal, Habit, NicheId, ScheduleBlock, Session, TargetKind } from '@/lib/types'
import type { AgendaSpan } from '@/domain/agenda'
import { rangeLabel } from '@/domain/agenda'
import type { HabitDayRow } from '@/domain/habits'
import { formatDuration, todayISO } from '@/lib/date'

/**
 * Tipos y helpers de los ítems que pinta la agenda de un día. Sin React ni
 * I/O: Calendar.tsx arma los ítems y los componentes de src/screens/calendar
 * los dibujan.
 */

/** Una sesión tal como se ve en la agenda: real (fila en BD) o proyectada del compromiso. */
export interface DayAgendaSession {
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
export type SessionState = DayAgendaSession['state']

/** Un hábito en la agenda de un día: UNA fila, con su progreso y su próxima hora. */
export interface DayHabitRowItem extends HabitDayRow {
  key: string
  habit: Habit
}

/** Lo que puede ocupar una fila de la cronología. */
export type AgendaRowItem =
  | {
      kind: 'session'
      key: string
      start: string | null
      end: string | null
      session: DayAgendaSession
      planDone: number
      planTotal: number
    }
  | { kind: 'habit'; key: string; start: string | null; end: null; habit: DayHabitRowItem }
  | { kind: 'event'; key: string; start: string | null; end: string | null; event: CalendarEvent; goal: Goal | null }

/** Estados que ya no admiten cronómetro (la sesión quedó cerrada). */
export const CLOSED_STATES: readonly SessionState[] = ['done', 'partial', 'missed']
/** Estados de una sesión real de HOY que llevan directo al cronómetro. */
export const OPEN_STATUSES: readonly Session['status'][] = ['pending', 'running', 'unconfirmed']

/** "4 h", "25 min" o la cantidad con su unidad. */
export function agendaTargetLabel(kind: TargetKind, value: number, unit: string | null): string {
  if (kind !== 'time') return `${value} ${unit ?? ''}`.trim()
  return formatDuration(value)
}

export function sessionStateLabel(state: SessionState): string {
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

/** Misma etiqueta, capitalizada, para abrir un subtítulo. */
export function sessionStateTitle(state: SessionState): string {
  const s = sessionStateLabel(state)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** ¿Sesión real de hoy, todavía abierta? (la que invita a darle play). */
export function isOpenToday(it: DayAgendaSession): boolean {
  return Boolean(
    it.session && it.session.date === todayISO() && OPEN_STATUSES.includes(it.session.status),
  )
}

/** Aria-label de una sesión: qué es y qué pasa al tocarla. */
export function sessionAriaLabel(it: DayAgendaSession): string {
  const range = it.span.start ? `, de ${rangeLabel(it.span.start, it.span.end)}` : ''
  if (it.session && isOpenToday(it)) return `Abrir la sesión de ${it.goal.title}${range}`
  if (it.session) {
    return `Ver el detalle de la sesión de ${it.goal.title}, ${sessionStateLabel(it.state)}${range}`
  }
  return `Sesión de ${it.goal.title}, ${sessionStateLabel(it.state)}${range}`
}

export function rowTitle(item: AgendaRowItem): string {
  if (item.kind === 'session') return item.session.goal.title
  if (item.kind === 'habit') return item.habit.habit.title
  return item.event.title
}

/** Área para teñir la fila; los eventos sueltos usan el gris neutro. */
export function rowArea(item: AgendaRowItem): NicheId {
  if (item.kind === 'session') return item.session.goal.area
  if (item.kind === 'habit') return item.habit.habit.area
  return item.goal?.area ?? 'otra'
}

/* ---- Resumen de un día para el acordeón de la semana --------------------- */

export interface WeekDaySummary {
  main: string
  sub: string | null
  /** Un punto por meta con sesión (áreas, sin repetir). */
  dots: NicheId[]
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function weekDaySummary(input: {
  day: string
  today: string
  sessions: DayAgendaSession[]
  habits: DayHabitRowItem[]
  events: CalendarEvent[]
  deadlines: Goal[]
}): WeekDaySummary {
  const { day, today, sessions, habits, events, deadlines } = input
  const parts: string[] = []

  if (sessions.length > 0) {
    const n = sessions.length
    // `done` cuenta `done` y `partial` juntos: una sesión parcial cuenta como
    // cumplida en toda la app (mismo criterio que el encabezado de Hoy).
    const done = sessions.filter((s) => s.state === 'done' || s.state === 'partial').length
    if (day > today) parts.push(plural(n, 'sesión', 'sesiones'))
    else if (day < today && done === n) parts.push(`${plural(n, 'sesión cumplida', 'sesiones cumplidas')}`)
    else parts.push(`${done} de ${plural(n, 'sesión', 'sesiones')}`)
  }
  if (habits.length > 0) {
    const n = habits.length
    if (day > today) parts.push(plural(n, 'hábito', 'hábitos'))
    else parts.push(`Hábitos ${habits.filter((h) => h.complete).length} de ${n}`)
  }
  if (events.length > 0) parts.push(plural(events.length, 'evento', 'eventos'))
  if (deadlines.length === 1) parts.push(`Meta: ${deadlines[0].title}`)
  else if (deadlines.length > 1) parts.push(`${deadlines.length} metas con fecha`)

  const dots: NicheId[] = []
  for (const s of sessions) if (!dots.includes(s.goal.area)) dots.push(s.goal.area)

  if (parts.length === 0) return { main: 'Nada agendado', sub: null, dots }
  const [main, ...rest] = parts
  return { main, sub: rest.length > 0 ? rest.join(' · ') : null, dots }
}
