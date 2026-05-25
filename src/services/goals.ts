import type { Goal, GoalStatus, NicheId } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface GoalRow {
  id: string
  user_id: string
  title: string
  why: string | null
  target_date: string | null
  area: string
  success_criteria: string | null
  template_key: string
  current_milestone: number | null
  last_reviewed_at: string | null
  status: string
  created_at: string
  completed_at: string | null
}

function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    why: row.why,
    targetDate: row.target_date,
    area: row.area as NicheId,
    successCriteria: row.success_criteria,
    templateKey: row.template_key,
    // Los ?? hacen que la app funcione aún si una migración nueva no corrió todavía.
    currentMilestone: row.current_milestone ?? 0,
    lastReviewedAt: row.last_reviewed_at ?? null,
    status: row.status as GoalStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

/** Datos que entrega el wizard (Mecanismo E) para crear una meta. */
export interface NewGoalInput {
  title: string
  why: string | null
  targetDate: string | null
  area: NicheId
  successCriteria: string | null
  templateKey: string
}

export async function listGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as GoalRow[]).map(mapGoal)
}

/** Una meta por id (o null). Evita traer toda la lista para ver el detalle. */
export async function getGoal(goalId: string): Promise<Goal | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapGoal(data as GoalRow) : null
}

export async function createGoal(userId: string, input: NewGoalInput): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      title: input.title,
      why: input.why,
      target_date: input.targetDate,
      area: input.area,
      success_criteria: input.successCriteria,
      template_key: input.templateKey,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapGoal(data as GoalRow)
}

export async function setGoalStatus(goalId: string, status: GoalStatus): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({
      status,
      // Registra cuándo se completó (y lo limpia si se reactiva).
      completed_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', goalId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapGoal(data as GoalRow)
}

/** Fija el hito actual de una meta dentro de su camino (Roadmap). */
export async function setGoalMilestone(goalId: string, index: number): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({ current_milestone: index })
    .eq('id', goalId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapGoal(data as GoalRow)
}

/** Marca la meta como revisada ahora (revisión guiada, Sección 6). */
export async function markGoalReviewed(goalId: string): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq('id', goalId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapGoal(data as GoalRow)
}
