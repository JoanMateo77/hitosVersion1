import type { CalendarEvent, Goal, Habit, NicheId, ScheduleBlock, Session, TargetKind } from '@/lib/types'
import type { AgendaSpan } from '@/domain/agenda'
import { rangeLabel } from '@/domain/agenda'
import type { HabitDayRow } from '@/domain/habits'
import { formatDuration, todayISO } from '@/lib/date'
import { goalTone } from '@/lib/goalAccent'

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
  state: 'pending' | 'running' | 'done' | 'partial' | 'missed' | 'unconfirmed' | 'skipped' | 'projected'
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
export const CLOSED_STATES: readonly SessionState[] = ['done', 'partial', 'missed', 'skipped']
/** Estados de una sesión real de HOY que llevan directo al cronómetro. */
export const OPEN_STATUSES: readonly Session['status'][] = ['pending', 'running', 'unconfirmed']

/**
 * Solo se salta un día que sigue abierto sin empezar (pendiente o proyectado)
 * y que no pasó: saltar un día viejo serviría para reparar una racha rota.
 */
export function canSkip(state: SessionState, day: string, today: string): boolean {
  return day >= today && (state === 'pending' || state === 'projected')
}

/** Los días (lunes=0) en que la meta tiene agenda, sin repetir y en orden. */
export function goalWeekdays(blocks: ScheduleBlock[]): number[] {
  return [...new Set(blocks.map((b) => b.weekday))].sort((a, b) => a - b)
}

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
    case 'skipped':
      return 'saltada'
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
export function rowTone(item: AgendaRowItem): NicheId {
  if (item.kind === 'session') return goalTone(item.session.goal)
  if (item.kind === 'habit') return item.habit.habit.area
  return item.goal ? goalTone(item.goal) : 'otra'
}

/* ---- Resumen de un día para el acordeón de la semana --------------------- */

export interface WeekDaySummary {
  main: string
  sub: string | null
  /** Un punto por meta con sesión (su color: propio o del área, sin repetir). */
  dots: NicheId[]
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function sessionsPart(sessions: DayAgendaSession[], day: string, today: string): string | null {
  const n = sessions.length
  if (n === 0) return null
  if (day > today) return plural(n, 'sesión', 'sesiones')
  // `done` cuenta `done` y `partial` juntos: una sesión parcial cuenta como
  // cumplida en toda la app (mismo criterio que el encabezado de Hoy).
  const done = sessions.filter((s) => s.state === 'done' || s.state === 'partial').length
  if (day < today && done === n) return plural(n, 'sesión cumplida', 'sesiones cumplidas')
  return `${done} de ${plural(n, 'sesión', 'sesiones')}`
}

function habitsPart(habits: DayHabitRowItem[], day: string, today: string): string | null {
  const n = habits.length
  if (n === 0) return null
  if (day > today) return plural(n, 'hábito', 'hábitos')
  return `Hábitos ${habits.filter((h) => h.complete).length} de ${n}`
}

function deadlinesPart(deadlines: Goal[]): string | null {
  if (deadlines.length === 1) return `Meta: ${deadlines[0].title}`
  if (deadlines.length > 1) return `${deadlines.length} metas con fecha`
  return null
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
  const parts = [
    sessionsPart(sessions, day, today),
    habitsPart(habits, day, today),
    events.length > 0 ? plural(events.length, 'evento', 'eventos') : null,
    deadlinesPart(deadlines),
  ].filter((p): p is string => p !== null)

  const dots: NicheId[] = []
  for (const s of sessions) {
    const tone = goalTone(s.goal)
    if (!dots.includes(tone)) dots.push(tone)
  }

  if (parts.length === 0) return { main: 'Nada agendado', sub: null, dots }
  const [main, ...rest] = parts
  return { main, sub: rest.length > 0 ? rest.join(' · ') : null, dots }
}

/** Un punto de la celda del mes. */
export interface MonthDot {
  key: string
  /** session = una sesión de meta ese día (punto neutro) · goal = fecha
   *  objetivo de una meta (anillo del color de su área: el único acento). */
  kind: 'session' | 'goal'
  area: NicheId | null
}

/** Máximo de puntos por celda del mes: más se vuelve confeti ilegible. */
export const MONTH_DOTS_MAX = 3

/**
 * Puntos de una celda del mes, con significado y nunca más de 3:
 * - la fecha objetivo va primero, como anillo del color de la meta (el único
 *   color de la grilla: es lo raro y lo importante);
 * - luego un punto neutro por sesión de meta (cuánta carga tiene el día).
 * Hábitos y eventos no suman puntos: casi todos los días los tienen y el
 * panel del día los muestra.
 */
export function monthDots({ sessions, deadline }: { sessions: number; deadline: NicheId | null }): MonthDot[] {
  const dots: MonthDot[] = []
  if (deadline) dots.push({ key: 'goal', kind: 'goal', area: deadline })
  for (let i = 0; dots.length < MONTH_DOTS_MAX && i < sessions; i++) {
    dots.push({ key: `s-${i}`, kind: 'session', area: null })
  }
  return dots
}
