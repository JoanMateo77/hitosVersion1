import type { Habit, HabitCheck, NicheId } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface HabitRow {
  id: string
  user_id: string
  title: string
  area: string
  weekdays: number[]
  created_at: string
  archived_at: string | null
}

interface HabitCheckRow {
  habit_id: string
  date: string
}

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    area: row.area as NicheId,
    weekdays: row.weekdays ?? [],
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }
}

function mapHabitCheck(row: HabitCheckRow): HabitCheck {
  return {
    habitId: row.habit_id,
    date: row.date,
  }
}

/** Hábitos del usuario: activos primero (archived_at null), luego por antigüedad. */
export async function listHabits(userId: string): Promise<Habit[]> {
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as HabitRow[]).map(mapHabit)
}

export async function createHabit(
  userId: string,
  input: { title: string; area: NicheId; weekdays: number[] },
): Promise<Habit> {
  const { data, error } = await supabase
    .from('habits')
    .insert({
      user_id: userId,
      title: input.title,
      area: input.area,
      weekdays: input.weekdays,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapHabit(data as HabitRow)
}

async function patchHabit(habitId: string, patch: Record<string, unknown>): Promise<Habit> {
  const { data, error } = await supabase
    .from('habits')
    .update(patch)
    .eq('id', habitId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapHabit(data as HabitRow)
}

export function updateHabit(
  habitId: string,
  patch: Partial<{ title: string; area: NicheId; weekdays: number[] }>,
): Promise<Habit> {
  // Solo se envían las columnas presentes para no pisar valores con undefined.
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.area !== undefined) row.area = patch.area
  if (patch.weekdays !== undefined) row.weekdays = patch.weekdays
  return patchHabit(habitId, row)
}

/** Archiva o reactiva un hábito (archivar conserva el historial de checks). */
export function setHabitArchived(habitId: string, archived: boolean): Promise<Habit> {
  return patchHabit(habitId, { archived_at: archived ? new Date().toISOString() : null })
}

/** Checks del usuario en un rango de fechas (para rachas y vista semanal). */
export async function listHabitChecksInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<HabitCheck[]> {
  const { data, error } = await supabase
    .from('habit_checks')
    .select('habit_id, date')
    .eq('user_id', userId)
    .gte('date', fromISO)
    .lte('date', toISO)
  if (error) throw new Error(error.message)
  return (data as HabitCheckRow[]).map(mapHabitCheck)
}

/**
 * Marca o desmarca el cumplimiento de un hábito en una fecha. Idempotente:
 * el índice único (habit_id, date) + ignoreDuplicates evita duplicados ante
 * toques repetidos o pestañas concurrentes.
 */
export async function setHabitCheck(
  userId: string,
  habitId: string,
  dateISO: string,
  done: boolean,
): Promise<void> {
  if (done) {
    const { error } = await supabase
      .from('habit_checks')
      .upsert(
        { user_id: userId, habit_id: habitId, date: dateISO },
        { onConflict: 'habit_id,date', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('habit_checks')
      .delete()
      .eq('habit_id', habitId)
      .eq('date', dateISO)
    if (error) throw new Error(error.message)
  }
}
