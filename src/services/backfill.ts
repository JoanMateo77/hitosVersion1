import type { Goal } from '@/lib/types'
import { buildMilestonesFromTemplate, weekdaysForCadence } from '@/domain/commitment'
import { getTemplate } from '@/domain/templates'
import { createMilestones, goalIdsWithMilestones } from '@/services/milestones'
import { createScheduleBlocks, listScheduleForUser } from '@/services/schedule'

const FLAG = 'logralo.backfill-v1'

/**
 * Migración perezosa (Fase 1): a las metas creadas ANTES del modelo nuevo les
 * copia los hitos de su plantilla (marcando los primeros current_milestone como
 * cumplidos) y les crea un compromiso desde la cadencia legacy (25 min/sesión).
 * Corre una vez por sesión de navegador; es idempotente porque consulta qué
 * metas ya tienen datos.
 */
export async function ensureCommitmentBackfill(userId: string, goals: Goal[]): Promise<void> {
  try {
    if (sessionStorage.getItem(FLAG)) return
  } catch {
    /* sin sessionStorage igual seguimos: el chequeo de abajo es la verdad */
  }

  const candidates = goals.filter((g) => g.status === 'active' || g.status === 'paused')
  if (candidates.length > 0) {
    const withMilestones = await goalIdsWithMilestones(userId)
    const allBlocks = await listScheduleForUser(userId)
    const withSchedule = new Set(allBlocks.map((b) => b.goalId))

    for (const goal of candidates) {
      const template = getTemplate(goal.templateKey)
      if (!withMilestones.has(goal.id)) {
        await createMilestones(
          userId,
          goal.id,
          buildMilestonesFromTemplate(template, goal.currentMilestone),
        )
      }
      if (!withSchedule.has(goal.id)) {
        await createScheduleBlocks(
          userId,
          goal.id,
          weekdaysForCadence(template.cadence).map((weekday) => ({
            weekday,
            targetKind: 'time' as const,
            targetValue: 25,
            unit: null,
            startTime: null,
          })),
        )
      }
    }
  }

  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* ignore */
  }
}
