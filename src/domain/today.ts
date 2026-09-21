import type { CalendarEvent, Habit, HabitCheck, NicheId, Session, Task } from '@/lib/types'
import { eventSpan, rangeLabel, sessionSpan } from '@/domain/agenda'
import { frameForStreak } from '@/domain/frames'
import { habitDoneCount, habitTarget, nextSlot } from '@/domain/habits'
import { elapsedSeconds, formatClock } from '@/domain/sessions'
import { formatTime12, parseISO } from '@/lib/date'

/**
 * Pantalla Hoy (rediseño 2026-09): helpers de dominio puros para la cabecera,
 * el héroe "Tu siguiente paso" y la lista "Más tarde hoy". Sin I/O ni React;
 * reutiliza los helpers ya existentes de agenda/habits/sessions/frames.
 */

/** Saludo según la hora del día (0-23). */
export function greeting(hour: number): string {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Primera palabra de un valor: recorta espacios y toma hasta el primer espacio interno. */
function firstWord(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed.split(/\s+/)[0]
}

/** Capitaliza: primera letra mayúscula, resto minúsculas. */
function capitalize(word: string): string {
  if (word === '') return ''
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** Parte local del email (antes de @) capitalizada hasta el primer separador o dígito. */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const cut = local.split(/[._\-+0-9]/)[0] ?? ''
  return capitalize(cut)
}

/**
 * Nombre para mostrar en la cabecera: primera palabra de full_name o name si
 * hay uno no vacío; si no, la parte local del email (hasta el primer
 * separador o dígito), capitalizada. '' si nada sirve.
 */
export function displayNameFrom(
  meta: { full_name?: unknown; name?: unknown } | null | undefined,
  email: string,
): string {
  const fromMeta = firstWord(meta?.full_name) ?? firstWord(meta?.name)
  if (fromMeta) return fromMeta
  return nameFromEmail(email)
}

/**
 * Iniciales para el avatar (dos letras mayúsculas): de las dos primeras
 * palabras del nombre, o las dos primeras letras si el nombre es una sola
 * palabra; sin nombre, las dos primeras letras del email; si nada alcanza, '·'.
 */
export function initialsFrom(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '')
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  const trimmedEmail = email.trim()
  if (trimmedEmail.length > 0) return trimmedEmail.slice(0, 2).toUpperCase()
  return '·'
}

const HEADER_DATE = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** "Lunes, 21 de septiembre": capitaliza el día de la semana y le pone coma detrás. */
export function formatHeaderDate(dateISO: string): string {
  const parts = HEADER_DATE.formatToParts(parseISO(dateISO))
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  return `${capitalize(weekday)}, ${day} de ${month}`
}

/** Etiquetas cortas de área para la cabecera del héroe (4.4). */
export const SHORT_NICHE_LABELS: Record<NicheId, string> = {
  salud: 'Salud',
  finanzas: 'Finanzas',
  carrera: 'Trabajo',
  aprendizaje: 'Aprendizaje',
  relaciones: 'Relaciones',
  creatividad: 'Crear',
  bienestar: 'Bienestar',
  otra: 'Otra',
}

/** Reloj grande del héroe: "h:mm" si el transcurrido llega a la hora, si no "m:ss". */
export function formatElapsed(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}:${String(m).padStart(2, '0')}`
  }
  return formatClock(seconds)
}

/** "150 min -> '2 h 30'", "120 min -> '2 h'", "45 min -> '45 min'". */
function humanMinutes(totalMin: number): string {
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
  }
  return `${totalMin} min`
}

/** Objetivo comprometido en texto humano: "25 min", "2 h 30", "10 páginas". */
export function formatCommitted(s: Pick<Session, 'targetKind' | 'targetValue' | 'unit'>): string {
  if (s.targetKind === 'time') return humanMinutes(s.targetValue)
  return `${s.targetValue} ${s.unit ?? ''}`.trim()
}

/** Línea de progreso del héroe: "Llevas X de Y comprometidas/objetivo". */
export function progressLine(s: Session, now: Date): string {
  if (s.targetKind === 'time') {
    const elapsedMin = Math.floor(elapsedSeconds(s, now) / 60)
    const elapsedHuman = elapsedMin === 0 ? '0 min' : humanMinutes(elapsedMin)
    return `Llevas ${elapsedHuman} de ${formatCommitted(s)} comprometidas`
  }
  return `Llevas ${s.actualValue ?? 0} de ${s.targetValue} ${s.unit ?? ''}`.trim()
}

/** La sesión pendiente de hora más temprana; sin hora quedan después, en el orden dado. */
export function nextPendingSession(sessions: Session[]): Session | null {
  const pending = sessions.filter((s) => s.status === 'pending')
  if (pending.length === 0) return null
  let best: Session | null = null
  for (const s of pending) {
    if (best === null) {
      best = s
      continue
    }
    if (s.plannedTime === null) continue
    if (best.plannedTime === null || s.plannedTime < best.plannedTime) best = s
  }
  return best
}

/** Etiqueta del marco por racha, o "Sin marco" si aún no se gana ninguno. */
export function frameCaption(streak: number): string {
  const frame = frameForStreak(streak)
  if (frame) return frame.label
  return 'Sin marco'
}

export type LaterItemKind = 'session' | 'habit' | 'task' | 'event'

export interface LaterItem {
  kind: LaterItemKind
  id: string
  title: string
  subtitle: string
  startMin: number | null
  done: boolean
}

/** "HH:MM" -> minutos desde medianoche. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

const KIND_ORDER: Record<LaterItemKind, number> = { session: 0, habit: 1, event: 2, task: 3 }

/**
 * Ítems de "Más tarde hoy": sesiones (sin la del héroe ni las en curso/sin
 * confirmar), hábitos que tocan hoy (ya filtrados por el llamador con
 * habitsDueOn), tareas propias del usuario y eventos. Orden: hora ascendente,
 * sin hora al final; empate por tipo (sesión, hábito, evento, tarea) y luego
 * por orden de entrada.
 */
export function laterTodayItems(input: {
  sessions: { session: Session; goalTitle: string }[]
  habits: Habit[]
  habitChecks: HabitCheck[]
  tasks: Task[]
  events: CalendarEvent[]
  today: string
  excludeSessionId?: string | null
}): LaterItem[] {
  const items: LaterItem[] = []

  for (const { session, goalTitle } of input.sessions) {
    if (session.id === input.excludeSessionId) continue
    if (session.status === 'running' || session.status === 'unconfirmed') continue
    const span = sessionSpan(session.plannedTime, session.targetKind, session.targetValue)
    const subtitle = span.start ? rangeLabel(span.start, span.end) : formatCommitted(session)
    items.push({
      kind: 'session',
      id: session.id,
      title: `Sesión · ${goalTitle}`,
      subtitle,
      startMin: session.plannedTime ? toMinutes(session.plannedTime) : null,
      done: session.status === 'done' || session.status === 'partial' || session.status === 'missed',
    })
  }

  for (const h of input.habits) {
    const target = habitTarget(h)
    const doneCount = habitDoneCount(input.habitChecks, h.id, input.today)
    const next = nextSlot(h, input.habitChecks, input.today)
    const nextTime = next !== null ? (h.times?.[next] ?? null) : null
    let subtitle: string
    let startMin: number | null
    if (target > 1) {
      subtitle = `${nextTime ? `próxima ${formatTime12(nextTime)} · ` : ''}${doneCount} de ${target}`
      startMin = nextTime ? toMinutes(nextTime) : null
    } else {
      const soloTime = h.times?.[0] ?? null
      subtitle = soloTime ? formatTime12(soloTime) : 'Sin hora'
      startMin = soloTime ? toMinutes(soloTime) : null
    }
    items.push({
      kind: 'habit',
      id: h.id,
      title: h.title,
      subtitle,
      startMin,
      done: doneCount >= target,
    })
  }

  for (const t of input.tasks) {
    if (t.source !== 'user' || t.status === 'postponed') continue
    items.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      subtitle: 'Sin hora',
      startMin: null,
      done: t.status === 'done',
    })
  }

  for (const e of input.events) {
    const span = eventSpan(e)
    const subtitle =
      e.allDay || !e.startTime ? 'Todo el día' : rangeLabel(e.startTime, span.end)
    items.push({
      kind: 'event',
      id: e.id,
      title: e.title,
      subtitle,
      startMin: e.startTime ? toMinutes(e.startTime) : null,
      done: Boolean(e.doneAt),
    })
  }

  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const am = a.item.startMin
      const bm = b.item.startMin
      if (am !== null && bm !== null && am !== bm) return am - bm
      if (am !== null && bm === null) return -1
      if (am === null && bm !== null) return 1
      const kindDiff = KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind]
      if (kindDiff !== 0) return kindDiff
      return a.index - b.index
    })
    .map(({ item }) => item)
}
