import type { CalendarEvent, NicheId } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { isMissingColumn, readArea, withoutArea } from '@/services/areaColumn'

interface EventRow {
  id: string
  user_id: string
  goal_id: string | null
  title: string
  notes: string | null
  event_date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  /** Ausente hasta que se aplique la migración 0014. */
  done_at?: string | null
  created_at: string
  /** Ausente hasta que se aplique la migración 0022. */
  area?: string | null
}

/** Normaliza "HH:MM:SS" (tipo time de Postgres) a "HH:MM" para la UI. */
function shortTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

function mapEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    title: row.title,
    notes: row.notes,
    date: row.event_date,
    startTime: shortTime(row.start_time),
    endTime: shortTime(row.end_time),
    allDay: row.all_day,
    doneAt: row.done_at ?? null,
    createdAt: row.created_at,
    area: readArea(row.area),
  }
}

/**
 * Marca o desmarca un evento como hecho. Si la migración 0014 no está aplicada
 * lanza un error con `code: 'missing-column'` para que la UI avise sin romperse.
 */
export async function setEventDone(id: string, done: boolean): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('events')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    if (isMissingColumn(error)) {
      const err = new Error('Para tachar cosas de la agenda falta actualizar la base de datos.')
      ;(err as Error & { code?: string }).code = 'missing-column'
      throw err
    }
    throw new Error(error.message)
  }
  return mapEvent(data as EventRow)
}

export interface EventInput {
  title: string
  date: string
  allDay: boolean
  startTime: string | null
  endTime: string | null
  goalId: string | null
  notes: string | null
  /** Área (color). Ausente = no se toca la que tenga guardada. */
  area?: NicheId | null
}

/** Aplana el input a columnas; un evento de día completo no guarda horas. */
function toRow(input: EventInput) {
  return {
    ...(input.area === undefined ? {} : { area: input.area }),
    title: input.title,
    event_date: input.date,
    all_day: input.allDay,
    start_time: input.allDay ? null : input.startTime,
    end_time: input.allDay ? null : input.endTime,
    goal_id: input.goalId,
    notes: input.notes,
  }
}

/** Eventos del usuario dentro de [fromISO, toISO] (ambos inclusive). */
export async function listEventsInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .gte('event_date', fromISO)
    .lte('event_date', toISO)
    .order('event_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as EventRow[]).map(mapEvent)
}

export async function createEvent(userId: string, input: EventInput): Promise<CalendarEvent> {
  const insert = (row: Record<string, unknown>) => supabase.from('events').insert(row).select('*').single()
  const row = { user_id: userId, ...toRow(input) }
  let { data, error } = await insert(row)
  // Sin la migración 0022 se guarda sin área: el evento importa más que su color.
  if (error && 'area' in row && isMissingColumn(error)) ({ data, error } = await insert(withoutArea(row)))
  if (error) throw new Error(error.message)
  return mapEvent(data as EventRow)
}

export async function updateEvent(id: string, input: EventInput): Promise<CalendarEvent> {
  const update = (row: Record<string, unknown>) => supabase.from('events').update(row).eq('id', id).select('*').single()
  const row = toRow(input)
  let { data, error } = await update(row)
  if (error && 'area' in row && isMissingColumn(error)) ({ data, error } = await update(withoutArea(row)))
  if (error) throw new Error(error.message)
  return mapEvent(data as EventRow)
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Minutos entre dos horas "HH:MM[:SS]" del mismo día (0 si el rango es inválido). */
function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

/**
 * Minutos agendados por meta en un rango, sumando solo eventos CON horario que
 * estén ligados a una meta (Sección 4.2: "esta semana le dedicaste X a tu meta").
 */
export async function minutesByGoalInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('events')
    .select('goal_id, start_time, end_time')
    .eq('user_id', userId)
    .eq('all_day', false)
    .gte('event_date', fromISO)
    .lte('event_date', toISO)
    .not('goal_id', 'is', null)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null)
  if (error) throw new Error(error.message)
  const mins = new Map<string, number>()
  for (const row of data as { goal_id: string; start_time: string; end_time: string }[]) {
    const d = minutesBetween(row.start_time, row.end_time)
    if (d > 0) mins.set(row.goal_id, (mins.get(row.goal_id) ?? 0) + d)
  }
  return mins
}
