import type { ScheduleBlock } from '@/lib/types'
import type { CommitmentBlockDraft } from '@/domain/commitment'
import { diffSchedule, sessionsToSync } from '@/domain/scheduleEdit'
import { listGoalSessionsFrom, syncScheduledSessions } from '@/services/sessions'
import { supabase } from '@/lib/supabase'

interface ScheduleRow {
  id: string
  goal_id: string
  user_id: string
  weekday: number
  target_kind: string
  target_value: number
  unit: string | null
  start_time: string | null
  created_at: string
}

function mapBlock(row: ScheduleRow): ScheduleBlock {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    weekday: row.weekday,
    targetKind: row.target_kind as ScheduleBlock['targetKind'],
    targetValue: row.target_value,
    unit: row.unit,
    // Postgres devuelve "HH:MM:SS"; en la app usamos "HH:MM".
    startTime: row.start_time ? row.start_time.slice(0, 5) : null,
    createdAt: row.created_at,
  }
}

/** Todos los bloques del usuario (guardia de sobrecompromiso, agenda futura). */
export async function listScheduleForUser(userId: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('goal_schedule')
    .select('*')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data as ScheduleRow[]).map(mapBlock)
}

/**
 * Bloques del usuario SOLO de metas activas: la guardia de sobrecompromiso no
 * debe contar agenda de metas logradas, pausadas o archivadas.
 */
export async function listActiveGoalSchedule(userId: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('goal_schedule')
    .select('*, goals!inner(status)')
    .eq('user_id', userId)
    .eq('goals.status', 'active')
  if (error) throw new Error(error.message)
  return (data as ScheduleRow[]).map(mapBlock)
}

export async function listScheduleForGoal(goalId: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('goal_schedule')
    .select('*')
    .eq('goal_id', goalId)
    .order('weekday', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as ScheduleRow[]).map(mapBlock)
}

export async function createScheduleBlocks(
  userId: string,
  goalId: string,
  drafts: CommitmentBlockDraft[],
): Promise<ScheduleBlock[]> {
  if (drafts.length === 0) return []
  const { data, error } = await supabase
    .from('goal_schedule')
    .insert(
      drafts.map((d) => ({
        goal_id: goalId,
        user_id: userId,
        weekday: d.weekday,
        target_kind: d.targetKind,
        target_value: d.targetValue,
        unit: d.unit,
        start_time: d.startTime,
      })),
    )
    .select('*')
  if (error) throw new Error(error.message)
  return (data as ScheduleRow[]).map(mapBlock)
}

/** Fija (o quita) la hora preferida de un bloque: "todos los lunes a las 19:00". */
export async function updateBlockStartTime(
  blockId: string,
  startTime: string | null,
): Promise<ScheduleBlock> {
  const { data, error } = await supabase
    .from('goal_schedule')
    .update({ start_time: startTime })
    .eq('id', blockId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapBlock(data as ScheduleRow)
}

/**
 * Guarda el compromiso editado por diferencias (domain/scheduleEdit): los
 * bloques que siguen conservan su id (y con él el historial de sus sesiones),
 * los nuevos se insertan y los quitados se borran. Antes de borrar/actualizar
 * bloques se sincronizan las sesiones pendientes de hoy en adelante, para que
 * no queden huérfanas ni duplicadas junto a los bloques nuevos.
 */
export async function applyScheduleChange(
  userId: string,
  goalId: string,
  current: ScheduleBlock[],
  desired: CommitmentBlockDraft[],
  todayISO: string,
): Promise<ScheduleBlock[]> {
  const change = diffSchedule(current, desired)
  const sessions = await listGoalSessionsFrom(userId, goalId, todayISO)
  await syncScheduledSessions(userId, sessionsToSync(change, sessions, todayISO))

  const updates = await Promise.all(
    change.update.map((u) =>
      supabase
        .from('goal_schedule')
        .update({
          target_kind: u.targetKind,
          target_value: u.targetValue,
          unit: u.unit,
          start_time: u.startTime,
        })
        .eq('id', u.id)
        .eq('user_id', userId),
    ),
  )
  const failed = updates.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  await createScheduleBlocks(userId, goalId, change.insert)

  if (change.remove.length > 0) {
    const { error } = await supabase
      .from('goal_schedule')
      .delete()
      .eq('user_id', userId)
      .eq('goal_id', goalId)
      .in('id', change.remove)
    if (error) throw new Error(error.message)
  }

  return listScheduleForGoal(goalId)
}
