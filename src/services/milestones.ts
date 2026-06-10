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
  return (data as MilestoneRow[]).map(mapMilestone)
}
