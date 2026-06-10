import type { Milestone } from '@/lib/types'
import type { MilestoneDraft } from '@/domain/commitment'
import { supabase } from '@/lib/supabase'

interface MilestoneRow {
  id: string
  goal_id: string
  user_id: string
  title: string
  position: number
  target_date: string | null
  done_at: string | null
  created_at: string
}

function mapMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    title: row.title,
    position: row.position,
    targetDate: row.target_date,
    doneAt: row.done_at,
    createdAt: row.created_at,
  }
}

export async function listMilestones(goalId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', goalId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as MilestoneRow[]).map(mapMilestone)
}

/** Set de goal_ids del usuario que YA tienen hitos (para el backfill). */
export async function goalIdsWithMilestones(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('milestones')
    .select('goal_id')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return new Set((data as { goal_id: string }[]).map((r) => r.goal_id))
}

export async function createMilestones(
  userId: string,
  goalId: string,
  drafts: MilestoneDraft[],
): Promise<Milestone[]> {
  if (drafts.length === 0) return []
  const { data, error } = await supabase
    .from('milestones')
    .insert(
      drafts.map((d) => ({
        goal_id: goalId,
        user_id: userId,
        title: d.title,
        position: d.position,
        target_date: d.targetDate,
        done_at: d.done ? new Date().toISOString() : null,
      })),
    )
    .select('*')
  if (error) throw new Error(error.message)
  return (data as MilestoneRow[])
    .sort((a, b) => a.position - b.position)
    .map(mapMilestone)
}

async function patchMilestone(id: string, patch: Record<string, unknown>): Promise<Milestone> {
  const { data, error } = await supabase
    .from('milestones')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapMilestone(data as MilestoneRow)
}

/** Marca o desmarca un hito como cumplido. */
export function setMilestoneDone(id: string, done: boolean): Promise<Milestone> {
  return patchMilestone(id, { done_at: done ? new Date().toISOString() : null })
}

export function updateMilestoneFields(
  id: string,
  fields: { title?: string; targetDate?: string | null },
): Promise<Milestone> {
  const patch: Record<string, unknown> = {}
  if (fields.title !== undefined) patch.title = fields.title
  if (fields.targetDate !== undefined) patch.target_date = fields.targetDate
  return patchMilestone(id, patch)
}

export async function addMilestone(
  userId: string,
  goalId: string,
  title: string,
  position: number,
): Promise<Milestone> {
  const { data, error } = await supabase
    .from('milestones')
    .insert({ goal_id: goalId, user_id: userId, title, position })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapMilestone(data as MilestoneRow)
}

export async function deleteMilestone(id: string): Promise<void> {
  const { error } = await supabase.from('milestones').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Persiste un reorden (updates secuenciales: pocas filas, sin RPC). */
export async function reorderMilestones(updates: { id: string; position: number }[]): Promise<void> {
  for (const u of updates) {
    const { error } = await supabase.from('milestones').update({ position: u.position }).eq('id', u.id)
    if (error) throw new Error(error.message)
  }
}

/** Progreso {done,total} por meta del usuario (listas de Metas y Progreso). */
export async function milestoneProgressByGoal(
  userId: string,
): Promise<Map<string, { done: number; total: number }>> {
  const { data, error } = await supabase
    .from('milestones')
    .select('goal_id, done_at')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  const map = new Map<string, { done: number; total: number }>()
  for (const row of data as { goal_id: string; done_at: string | null }[]) {
    const entry = map.get(row.goal_id) ?? { done: 0, total: 0 }
    entry.total += 1
    if (row.done_at) entry.done += 1
    map.set(row.goal_id, entry)
  }
  return map
}
