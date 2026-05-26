import type { CalendarEvent } from '@/lib/types'
import { supabase } from '@/lib/supabase'

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
  created_at: string
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
    createdAt: row.created_at,
  }
}

export interface EventInput {
  title: string
  date: string
  allDay: boolean
  startTime: string | null
  endTime: string | null
  goalId: string | null
  notes: string | null
}

/** Aplana el input a columnas; un evento de día completo no guarda horas. */
function toRow(input: EventInput) {
  return {
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
  const { data, error } = await supabase
    .from('events')
    .insert({ user_id: userId, ...toRow(input) })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapEvent(data as EventRow)
}

export async function updateEvent(id: string, input: EventInput): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('events')
    .update(toRow(input))
    .eq('id', id)
    .select('*')
    .single()
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
