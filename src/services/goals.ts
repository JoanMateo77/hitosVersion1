import type { Goal, GoalColor, GoalStatus, NicheId } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { parseGoalColor } from '@/lib/goalAccent'
import { UserMessageError } from '@/lib/errors'

interface GoalRow {
  id: string
  user_id: string
  title: string
  why: string | null
  target_date: string | null
  area: string
  success_criteria: string | null
  template_key: string
  last_reviewed_at: string | null
  status: string
  created_at: string
  completed_at: string | null
  /** Opcionales: si la migración 0019 no se aplicó aún, `select *` no las trae. */
  color?: string | null
  cover_path?: string | null
  cover_on_card?: boolean | null
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
    lastReviewedAt: row.last_reviewed_at ?? null,
    status: row.status as GoalStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    // Un valor fuera de la paleta (no debería pasar: hay check en la BD) cae al área.
    color: parseGoalColor(row.color),
    coverPath: row.cover_path ?? null,
    coverOnCard: row.cover_on_card === true,
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

/** Campos editables de una meta ya creada. */
export interface GoalEdit {
  title: string
  why: string | null
  targetDate: string | null
  area: NicheId
  successCriteria: string | null
  /**
   * Apariencia: solo se envían si cambiaron (undefined = no tocar). Así editar
   * el resto de la meta sigue funcionando aunque la migración 0019 no esté.
   */
  color?: GoalColor | null
  coverOnCard?: boolean
}

/** Códigos de "columna inexistente" (PostgreSQL y caché de esquema de PostgREST). */
const MISSING_COLUMN = new Set(['42703', 'PGRST204'])

/** Mensaje claro cuando falta la migración de color y portada. */
export function appearanceError(error: { code?: string; message: string }): Error {
  if (error.code && MISSING_COLUMN.has(error.code)) {
    return new UserMessageError('Falta aplicar la migración 0019 para el color y la portada de la meta.')
  }
  return new Error(error.message)
}

/** Edita los campos de una meta existente (no toca estado ni progreso). */
export async function updateGoal(goalId: string, edit: GoalEdit): Promise<Goal> {
  const patch: Record<string, unknown> = {
    title: edit.title,
    why: edit.why,
    target_date: edit.targetDate,
    area: edit.area,
    success_criteria: edit.successCriteria,
  }
  if (edit.color !== undefined) {
    // Doble barrera: la BD tiene su check; aquí no sale nada fuera de la paleta.
    if (edit.color !== null && parseGoalColor(edit.color) === null) throw new UserMessageError('Ese color no está en la paleta.')
    patch.color = edit.color
  }
  if (edit.coverOnCard !== undefined) patch.cover_on_card = edit.coverOnCard
  const { data, error } = await supabase
    .from('goals')
    .update(patch)
    .eq('id', goalId)
    .select('*')
    .single()
  if (error) throw appearanceError(error)
  return mapGoal(data as GoalRow)
}

/** Fija (o quita, con null) la foto de portada de la meta. Quitarla también la saca de la tarjeta. */
export async function setGoalCoverPath(goalId: string, coverPath: string | null): Promise<Goal> {
  const patch: Record<string, unknown> = { cover_path: coverPath }
  if (coverPath === null) patch.cover_on_card = false
  const { data, error } = await supabase
    .from('goals')
    .update(patch)
    .eq('id', goalId)
    .select('*')
    .single()
  if (error) throw appearanceError(error)
  return mapGoal(data as GoalRow)
}

/**
 * Borra una meta del usuario. Las tablas hijas (milestones, goal_schedule,
 * sessions, tasks) caen por ON DELETE CASCADE; notas, eventos y hábitos
 * vinculados se conservan sin vínculo (set null). Se usa al eliminar una meta
 * desde su detalle y para deshacer una creación a medias; el doble filtro por
 * user_id acota el radio de daño.
 */
export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}
