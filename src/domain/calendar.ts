/**
 * Lógica pura del calendario (sin dependencias de UI ni de datos).
 * La semana arranca en LUNES (convención rioplatense).
 */
import type { CalendarEvent } from '@/lib/types'
import { addDays, startOfMonth, startOfWeek } from '@/lib/date'

/** Etiquetas cortas de los días, de lunes a domingo. */
export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/** Los 7 días (lunes→domingo) de la semana que contiene la fecha ancla. */
export function weekDays(anchorISO: string): string[] {
  const start = startOfWeek(anchorISO)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/**
 * Grilla mensual de 6 semanas × 7 días (lunes→domingo). Incluye los días de
 * relleno de los meses vecinos para que la grilla sea siempre rectangular.
 */
export function monthGrid(anchorISO: string): string[][] {
  const gridStart = startOfWeek(startOfMonth(anchorISO))
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  )
}

/** ¿La fecha cae en el mismo mes que el ancla? (para atenuar el relleno). */
export function inSameMonth(dateISO: string, anchorISO: string): boolean {
  return dateISO.slice(0, 7) === anchorISO.slice(0, 7)
}

/** Orden dentro de un día: primero los de día completo, después por hora. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return (a.startTime ?? '').localeCompare(b.startTime ?? '')
}

/** Agrupa eventos por fecha (yyyy-mm-dd), ordenados dentro de cada día. */
export function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const list = map.get(e.date)
    if (list) list.push(e)
    else map.set(e.date, [e])
  }
  for (const list of map.values()) list.sort(compareEvents)
  return map
}
