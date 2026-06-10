import type { ScheduleBlock, Session, SessionStatus, TargetKind } from '@/lib/types'
import { weekdayMon0 } from '@/domain/commitment'
import { supabase } from '@/lib/supabase'

interface SessionRow {
  id: string
  goal_id: string
  user_id: string
  schedule_id: string | null
  session_date: string
  target_kind: string
  target_value: number
  unit: string | null
  planned_time: string | null
  started_at: string | null
  ended_at: string | null
  actual_value: number | null
  status: string
  paused_at: string | null
  paused_total_seconds: number | null
  created_at: string
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    scheduleId: row.schedule_id,
    date: row.session_date,
    targetKind: row.target_kind as TargetKind,
    targetValue: row.target_value,
    unit: row.unit,
    // Postgres devuelve "HH:MM:SS"; en la app usamos "HH:MM".
    plannedTime: row.planned_time ? row.planned_time.slice(0, 5) : null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    actualValue: row.actual_value,
    status: row.status as SessionStatus,
    pausedAt: row.paused_at,
    pausedTotalSeconds: row.paused_total_seconds ?? 0,
    createdAt: row.created_at,
  }
}

export async function listSessionsForDate(userId: string, dateISO: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_date', dateISO)
    .order('planned_time', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data as SessionRow[]).map(mapSession)
}

export async function listSessionsInRange(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('session_date', fromISO)
    .lte('session_date', toISO)
    .order('session_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as SessionRow[]).map(mapSession)
}

/**
 * Genera las sesiones del día desde los bloques comprometidos. Idempotente:
 * el índice único (schedule_id, session_date) + ignoreDuplicates hace que
 * generaciones concurrentes (StrictMode, multi-pestaña) no dupliquen filas.
 * Devuelve las sesiones del día ya generadas.
 */
export async function generateSessionsForDate(
  userId: string,
  dateISO: string,
  blocks: ScheduleBlock[],
): Promise<Session[]> {
  const due = blocks.filter((b) => b.weekday === weekdayMon0(dateISO))
  if (due.length > 0) {
    const rows = due.map((b) => ({
      goal_id: b.goalId,
      user_id: userId,
      schedule_id: b.id,
      session_date: dateISO,
      target_kind: b.targetKind,
      target_value: b.targetValue,
      unit: b.unit,
      planned_time: b.startTime,
    }))
    const { error } = await supabase
      .from('sessions')
      .upsert(rows, { onConflict: 'schedule_id,session_date', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  return listSessionsForDate(userId, dateISO)
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapSession(data as SessionRow) : null
}

async function patchSession(sessionId: string, patch: Record<string, unknown>): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .update(patch)
    .eq('id', sessionId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapSession(data as SessionRow)
}

/**
 * Una sola sesión corriendo a la vez: arrancar (o reanudar) una pausa
 * automáticamente cualquier otra que esté en marcha, como un reproductor.
 */
async function pauseOtherRunning(userId: string, exceptId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ paused_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'running')
    .is('paused_at', null)
    .neq('id', exceptId)
  if (error) throw new Error(error.message)
}

/** Arranca el cronómetro (pausando cualquier otra sesión en marcha). */
export async function startSession(userId: string, sessionId: string): Promise<Session> {
  await pauseOtherRunning(userId, sessionId)
  return patchSession(sessionId, { started_at: new Date().toISOString(), status: 'running' })
}

export function pauseSession(sessionId: string, pausedAtISO: string): Promise<Session> {
  return patchSession(sessionId, { paused_at: pausedAtISO })
}

/** Reanuda: el dominio calcula el total acumulado; acá solo se persiste. */
export async function resumeSession(
  userId: string,
  sessionId: string,
  pausedTotalSeconds: number,
): Promise<Session> {
  await pauseOtherRunning(userId, sessionId)
  return patchSession(sessionId, { paused_at: null, paused_total_seconds: pausedTotalSeconds })
}

/** Cierra la sesión con el resultado honesto del usuario. */
export function finishSession(
  sessionId: string,
  result: { status: 'done' | 'partial' | 'missed'; actualValue: number },
): Promise<Session> {
  return patchSession(sessionId, {
    status: result.status,
    actual_value: result.actualValue,
    ended_at: new Date().toISOString(),
    paused_at: null,
  })
}

/**
 * Retomar una sesión cerrada HOY conservando lo trabajado: el rato que estuvo
 * cerrada cuenta como pausa, así el reloj continúa donde quedó (ej. 7 de 90).
 * Si nunca tuvo cronómetro (check rápido), arranca de cero ahora.
 */
export async function resumeClosedSession(s: Session): Promise<Session> {
  await pauseOtherRunning(s.userId, s.id)
  if (!s.startedAt) {
    return patchSession(s.id, {
      status: 'running',
      started_at: new Date().toISOString(),
      ended_at: null,
      actual_value: null,
      paused_at: null,
      paused_total_seconds: 0,
    })
  }
  const gap = s.endedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(s.endedAt).getTime()) / 1000))
    : 0
  return patchSession(s.id, {
    status: 'running',
    ended_at: null,
    actual_value: null,
    paused_at: null,
    paused_total_seconds: s.pausedTotalSeconds + gap,
  })
}

/** Deshace un cierre (ej. check rápido por error): vuelve a pendiente. */
export function reopenSession(sessionId: string): Promise<Session> {
  return patchSession(sessionId, {
    status: 'pending',
    actual_value: null,
    started_at: null,
    ended_at: null,
    paused_at: null,
    paused_total_seconds: 0,
  })
}

/**
 * Sesiones que quedaron corriendo de días anteriores: se cierran solas como
 * "sin confirmar" para no bloquear el día nuevo (spec 4.2).
 */
export async function closeStaleSessions(userId: string, beforeISO: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'unconfirmed', ended_at: new Date().toISOString(), paused_at: null })
    .eq('user_id', userId)
    .eq('status', 'running')
    .lt('session_date', beforeISO)
  if (error) throw new Error(error.message)
}

/** Sesión espontánea de hoy ("¿una sesión extra?"). */
export async function createSpontaneousSession(
  userId: string,
  goalId: string,
  dateISO: string,
  target: { targetKind: TargetKind; targetValue: number; unit: string | null },
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      goal_id: goalId,
      user_id: userId,
      schedule_id: null,
      session_date: dateISO,
      target_kind: target.targetKind,
      target_value: target.targetValue,
      unit: target.unit,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapSession(data as SessionRow)
}

/** Cambia la hora planificada de una sesión ya generada. */
export function setSessionPlannedTime(sessionId: string, time: string | null): Promise<Session> {
  return patchSession(sessionId, { planned_time: time })
}

/** Totales históricos de una meta: sesiones cumplidas y minutos invertidos reales. */
export async function sessionStatsForGoal(
  goalId: string,
): Promise<{ done: number; minutes: number }> {
  const { data, error } = await supabase
    .from('sessions')
    .select('status, target_kind, actual_value')
    .eq('goal_id', goalId)
    .in('status', ['done', 'partial'])
  if (error) throw new Error(error.message)
  const rows = data as { status: string; target_kind: string; actual_value: number | null }[]
  let minutes = 0
  for (const r of rows) if (r.target_kind === 'time') minutes += r.actual_value ?? 0
  return { done: rows.length, minutes }
}
