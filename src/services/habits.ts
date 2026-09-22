import type { Habit, HabitCheck, HabitColor, HabitSkip, NicheId } from '@/lib/types'
import { HABIT_COLORS } from '@/domain/habits'
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
  /** Opcionales hasta correr la migración 0016 (identidad del hábito). */
  icon?: string | null
  color?: string | null
  unit?: string | null
  times_per_day?: number | null
  paused_until?: string | null
  created_at: string
  archived_at: string | null
}

interface HabitCheckRow {
  habit_id: string
  date: string
  /** Opcional hasta correr la migración 0013: el mapeo tolera su ausencia. */
  slot?: number | null
  /** Momento de la marca: se muestra como "· 7:12 am" en Hoy. */
  created_at?: string | null
}

/** Solo aceptamos claves conocidas de la paleta: lo demás cae al color del área. */
function mapColor(value: string | null | undefined): HabitColor | null {
  if (!value) return null
  return HABIT_COLORS.includes(value as HabitColor) ? (value as HabitColor) : null
}

function mapHabit(row: HabitRow): Habit {
  const times = row.times && row.times.length > 0 ? row.times : null
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    area: row.area as NicheId,
    weekdays: row.weekdays ?? [],
    times,
    icon: row.icon ?? null,
    color: mapColor(row.color),
    unit: row.unit ?? null,
    // Sin la columna (0016 sin aplicar) el objetivo sigue siendo "una por hora".
    timesPerDay: row.times_per_day ?? Math.max(1, times?.length ?? 0),
    pausedUntil: row.paused_until ?? null,
    goalId: row.goal_id ?? null,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }
}

function mapHabitCheck(row: HabitCheckRow): HabitCheck {
  const check: HabitCheck = {
    habitId: row.habit_id,
    date: row.date,
    slot: row.slot ?? 0,
  }
  if (row.created_at) check.at = row.created_at
  return check
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

/** Campos de identidad (migración 0016): viajan aparte para poder reintentar. */
interface HabitIdentityInput {
  icon?: string | null
  color?: HabitColor | null
  unit?: string | null
  timesPerDay?: number
  pausedUntil?: string | null
}

/** Error listo para la UI cuando falta la migración 0016. */
function missingColumnError(): Error {
  const err = new Error('Para usar esta función falta actualizar la base de datos.')
  ;(err as Error & { code?: string }).code = 'missing-column'
  return err
}

/** Traduce los campos nuevos a columnas; solo van los que se enviaron. */
function identityRow(input: HabitIdentityInput): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (input.icon !== undefined) row.icon = input.icon
  if (input.color !== undefined) row.color = input.color
  if (input.unit !== undefined) row.unit = input.unit
  if (input.timesPerDay !== undefined) row.times_per_day = input.timesPerDay
  if (input.pausedUntil !== undefined) row.paused_until = input.pausedUntil
  return row
}

export async function createHabit(
  userId: string,
  input: {
    title: string
    area: NicheId
    weekdays: number[]
    goalId?: string | null
    times?: string[] | null
  } & HabitIdentityInput,
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
  const identity = identityRow(input)
  const { data, error } = await supabase
    .from('habits')
    .insert({ ...row, ...identity })
    .select('*')
    .single()
  if (!error) return mapHabit(data as HabitRow)
  // Sin la migración 0016 el hábito se crea igual, solo sin icono ni color.
  if (isMissingColumn(error) && Object.keys(identity).length > 0) {
    const retry = await supabase.from('habits').insert(row).select('*').single()
    if (retry.error) throw new Error(retry.error.message)
    return mapHabit(retry.data as HabitRow)
  }
  throw new Error(error.message)
}

function runPatch(habitId: string, patch: Record<string, unknown>) {
  return supabase.from('habits').update(patch).eq('id', habitId).select('*').single()
}

async function patchHabit(habitId: string, patch: Record<string, unknown>): Promise<Habit> {
  const { data, error } = await runPatch(habitId, patch)
  if (error) throw new Error(error.message)
  return mapHabit(data as HabitRow)
}

export async function updateHabit(
  habitId: string,
  patch: Partial<{
    title: string
    area: NicheId
    weekdays: number[]
    goalId: string | null
    times: string[] | null
  }> &
    HabitIdentityInput,
): Promise<Habit> {
  // Solo se envían las columnas presentes para no pisar valores con undefined.
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.area !== undefined) row.area = patch.area
  if (patch.weekdays !== undefined) row.weekdays = patch.weekdays
  if (patch.goalId !== undefined) row.goal_id = patch.goalId
  if (patch.times !== undefined) row.times = patch.times
  const identity = identityRow(patch)
  if (Object.keys(identity).length === 0) return patchHabit(habitId, row)

  const { data, error } = await runPatch(habitId, { ...row, ...identity })
  if (!error) return mapHabit(data as HabitRow)
  if (!isMissingColumn(error)) throw new Error(error.message)
  // Sin migración: si el parche era SOLO de columnas nuevas no hay nada que
  // guardar; si además traía campos viejos, esos sí se guardan.
  if (Object.keys(row).length === 0) throw missingColumnError()
  return patchHabit(habitId, row)
}

/** Pausa el hábito hasta esa fecha inclusive (null lo reanuda). */
export async function setHabitPausedUntil(habitId: string, dateISO: string | null): Promise<Habit> {
  const { data, error } = await runPatch(habitId, { paused_until: dateISO })
  if (!error) return mapHabit(data as HabitRow)
  if (isMissingColumn(error)) throw missingColumnError()
  throw new Error(error.message)
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

// ---- Reorganizar un día (0015): horas del hábito distintas solo esa fecha ----

/** Excepción de horario de un hábito para UNA fecha concreta. */
export interface HabitDayOverride {
  habitId: string
  date: string
  times: string[]
}

/** ¿El error de PostgREST es "esa tabla no existe"? (migración 0015 sin aplicar) */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/** Excepciones de horario dentro de [fromISO, toISO]; sin migración, ninguna. */
export async function listHabitOverridesInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<HabitDayOverride[]> {
  const { data, error } = await supabase
    .from('habit_day_overrides')
    .select('habit_id, date, times')
    .eq('user_id', userId)
    .gte('date', fromISO)
    .lte('date', toISO)
  if (error) {
    if (isMissingTable(error)) return []
    throw new Error(error.message)
  }
  return (data as { habit_id: string; date: string; times: string[] | null }[]).map((r) => ({
    habitId: r.habit_id,
    date: r.date,
    times: r.times ?? [],
  }))
}

/**
 * Fija las horas de un hábito SOLO para una fecha (upsert). Si la migración
 * 0015 no está aplicada lanza un Error con `code: 'missing-column'` y mensaje
 * listo para la UI.
 */
export async function setHabitDayTimes(
  userId: string,
  habitId: string,
  dateISO: string,
  times: string[],
): Promise<void> {
  const { error } = await supabase
    .from('habit_day_overrides')
    .upsert(
      { user_id: userId, habit_id: habitId, date: dateISO, times },
      { onConflict: 'habit_id,date' },
    )
  if (error) {
    if (isMissingTable(error)) {
      const err = new Error('Para reorganizar el día falta actualizar la base de datos.')
      ;(err as Error & { code?: string }).code = 'missing-column'
      throw err
    }
    throw new Error(error.message)
  }
}

/** Vuelve el hábito a su horario de siempre en esa fecha. */
export async function clearHabitDayOverride(habitId: string, dateISO: string): Promise<void> {
  const { error } = await supabase
    .from('habit_day_overrides')
    .delete()
    .eq('habit_id', habitId)
    .eq('date', dateISO)
  if (error && !isMissingTable(error)) throw new Error(error.message)
}

// ---- "Saltar hoy" (0016): días que no cuentan para el hábito ---------------

/**
 * Saltos del usuario dentro de [fromISO, toISO]. Sin la migración 0016 no hay
 * tabla y devolvemos vacío: la app funciona igual, solo sin saltos.
 */
export async function listHabitSkipsInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<HabitSkip[]> {
  const { data, error } = await supabase
    .from('habit_skips')
    .select('habit_id, date')
    .eq('user_id', userId)
    .gte('date', fromISO)
    .lte('date', toISO)
  if (error) {
    if (isMissingTable(error)) return []
    throw new Error(error.message)
  }
  return (data as { habit_id: string; date: string }[]).map((r) => ({
    habitId: r.habit_id,
    date: r.date,
  }))
}

/**
 * Salta (o deshace el salto de) un día para un hábito. El insert es
 * idempotente: el único (habit_id, date) hace que un duplicado (23505)
 * signifique "ya estaba saltado". Sin migración lanza un Error con
 * `code: 'missing-column'` listo para la UI.
 */
export async function setHabitSkipped(
  userId: string,
  habitId: string,
  dateISO: string,
  skipped: boolean,
): Promise<void> {
  const { error } = skipped
    ? await supabase
        .from('habit_skips')
        .insert({ user_id: userId, habit_id: habitId, date: dateISO })
    : await supabase.from('habit_skips').delete().eq('habit_id', habitId).eq('date', dateISO)
  if (!error) return
  if (isMissingTable(error)) throw missingColumnError()
  if (skipped && error.code === '23505') return
  throw new Error(error.message)
}
