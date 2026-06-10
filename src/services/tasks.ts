import type { Task, TaskSource, TaskStatus } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface TaskRow {
  id: string
  user_id: string
  goal_id: string | null
  title: string
  plan_date: string
  source: string
  status: string
  created_at: string
  done_at: string | null
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    title: row.title,
    planDate: row.plan_date,
    source: row.source as TaskSource,
    status: row.status as TaskStatus,
    createdAt: row.created_at,
    doneAt: row.done_at,
  }
}

export async function listTasksForDate(userId: string, dateISO: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', dateISO)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as TaskRow[]).map(mapTask)
}

/** Tarea que agrega el usuario a mano (prioridad #1 del plan del día). */
export async function createUserTask(
  userId: string,
  title: string,
  planDate: string,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ user_id: userId, title, plan_date: planDate, source: 'user' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapTask(data as TaskRow)
}

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status,
      done_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', taskId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapTask(data as TaskRow)
}

export async function updateTaskTitle(taskId: string, title: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ title })
    .eq('id', taskId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapTask(data as TaskRow)
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw new Error(error.message)
}

/** Fecha (ISO) de la última acción completada por meta. Para alertas de olvido. */
export async function lastDoneByGoal(userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('tasks')
    .select('goal_id, done_at')
    .eq('user_id', userId)
    .eq('status', 'done')
    .not('goal_id', 'is', null)
    .not('done_at', 'is', null)
  if (error) throw new Error(error.message)
  const last = new Map<string, string>()
  for (const row of data as { goal_id: string; done_at: string }[]) {
    const current = last.get(row.goal_id)
    if (!current || row.done_at > current) last.set(row.goal_id, row.done_at)
  }
  return last
}

/** Cuenta acciones completadas de UNA meta en un rango (yyyy-mm-dd inclusive). */
export async function countDoneByGoalInRange(
  userId: string,
  goalId: string,
  fromISO: string,
  toISO: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .eq('status', 'done')
    .gte('plan_date', fromISO)
    .lte('plan_date', toISO)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Cuenta acciones completadas por meta (para el progreso básico en Metas). */
export async function countDoneByGoal(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('tasks')
    .select('goal_id')
    .eq('user_id', userId)
    .eq('status', 'done')
    .not('goal_id', 'is', null)
  if (error) throw new Error(error.message)
  const counts = new Map<string, number>()
  for (const row of data as { goal_id: string }[]) {
    counts.set(row.goal_id, (counts.get(row.goal_id) ?? 0) + 1)
  }
  return counts
}

/** Total de acciones completadas por el usuario. Si pasás `sinceISO`, cuenta
 *  solo desde esa fecha (plan_date inclusive) — útil para "esta semana". */
export async function countDoneTasks(userId: string, sinceISO?: string): Promise<number> {
  let query = supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'done')
  if (sinceISO) query = query.gte('plan_date', sinceISO)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Fechas (plan_date) en las que el usuario completó ≥1 tarea, desde `sinceISO`.
 *  Sirve para calcular la racha de días activos. */
export async function listActiveDates(userId: string, sinceISO: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('plan_date')
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('plan_date', sinceISO)
  if (error) throw new Error(error.message)
  const seen = new Set<string>()
  for (const row of data as { plan_date: string }[]) seen.add(row.plan_date)
  return [...seen]
}
