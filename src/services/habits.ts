import type { Habit, HabitCheck, NicheId } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface HabitRow {
  id: string
  user_id: string
  title: string
  area: string
  weekdays: number[]
  /** Opcional hasta correr la migración 0010: el mapeo tolera su ausencia. */
  goal_id?: string | null
  /** Opcional hasta correr la migración 0013: el mapeo tolera su ausencia. */
  times?: string[] | null
  created_at: string
  archived_at: string | null
}

interface HabitCheckRow {
  habit_id: string
  date: string
  /** Opcional hasta correr la migración 0013: el mapeo tolera su ausencia. */
  slot?: number | null
}

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    area: row.area as NicheId,
    weekdays: row.weekdays ?? [],
    times: row.times && row.times.length > 0 ? row.times : null,
    goalId: row.goal_id ?? null,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }
}

function mapHabitCheck(row: HabitCheckRow): HabitCheck {
  return {
    habitId: row.habit_id,
    date: row.date,
    slot: row.slot ?? 0,
  }
}

/** ¿El error de PostgREST es "esa columna no existe"? (migración sin aplicar) */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
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
  input: {
    title: string
    area: NicheId
    weekdays: number[]
    goalId?: string | null
    times?: string[] | null
  },
): Promise<Habit> {
  const row: Record<string, unknown> = {
    user_id: userId,
    title: input.title,
    area: input.area,
    weekdays: input.weekdays,
  }
  // Solo viaja si se eligió meta: crear hábitos sueltos sigue funcionando
  // aunque la migración 0010 (goal_id) no haya corrido todavía.
  if (input.goalId) row.goal_id = input.goalId
  // Igual con las horas (migración 0013): solo viajan si se eligieron.
  if (input.times && input.times.length > 0) row.times = input.times
  const { data, error } = await supabase.from('habits').insert(row).select('*').single()
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
  patch: Partial<{
    title: string
    area: NicheId
    weekdays: number[]
    goalId: string | null
    times: string[] | null
  }>,
): Promise<Habit> {
  // Solo se envían las columnas presentes para no pisar valores con undefined.
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.area !== undefined) row.area = patch.area
  if (patch.weekdays !== undefined) row.weekdays = patch.weekdays
  if (patch.goalId !== undefined) row.goal_id = patch.goalId
  if (patch.times !== undefined) row.times = patch.times
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
  // `select *` en vez de columnas explícitas: si la migración 0013 (slot) no
  // corrió aún, la consulta no falla y el mapeo asume slot 0 (igual que antes).
  const { data, error } = await supabase
    .from('habit_checks')
    .select('*')
    .eq('user_id', userId)
    .gte('date', fromISO)
    .lte('date', toISO)
  if (error) throw new Error(error.message)
  return (data as HabitCheckRow[]).map(mapHabitCheck)
}

/**
 * Marca o desmarca una repetición (slot) de un hábito en una fecha. Idempotente:
 * el índice único (habit_id, date, slot) hace que un insert duplicado (toques
 * repetidos, pestañas concurrentes) se ignore en vez de duplicar.
 *
 * Los hábitos sin horas usan siempre slot 0. Si la migración 0013 no corrió
 * aún (sin columna slot), se reintenta sin ella: con slot 0 el comportamiento
 * es idéntico al histórico.
 */
export async function setHabitCheck(
  userId: string,
  habitId: string,
  dateISO: string,
  done: boolean,
  slot = 0,
): Promise<void> {
  if (done) {
    // Insert simple (sin onConflict): el nombre del índice único cambia con la
    // migración 0013 y un duplicado (23505) significa "ya estaba marcado".
    const { error } = await supabase
      .from('habit_checks')
      .insert({ user_id: userId, habit_id: habitId, date: dateISO, slot })
    if (error && isMissingColumn(error) && slot === 0) {
      const retry = await supabase
        .from('habit_checks')
        .insert({ user_id: userId, habit_id: habitId, date: dateISO })
      if (retry.error && retry.error.code !== '23505') throw new Error(retry.error.message)
      return
    }
    if (error && error.code !== '23505') throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('habit_checks')
      .delete()
      .eq('habit_id', habitId)
      .eq('date', dateISO)
      .eq('slot', slot)
    if (error && isMissingColumn(error) && slot === 0) {
      const retry = await supabase
        .from('habit_checks')
        .delete()
        .eq('habit_id', habitId)
        .eq('date', dateISO)
      if (retry.error) throw new Error(retry.error.message)
      return
    }
    if (error) throw new Error(error.message)
  }
}
