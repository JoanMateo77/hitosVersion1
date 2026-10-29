import type { Goal } from '@/lib/types'
import { buildMilestonesFromTemplate, goalsMissingMilestones } from '@/domain/commitment'
import { getTemplate } from '@/domain/templates'
import { createMilestones, goalIdsWithMilestones } from '@/services/milestones'

const FLAG = 'logralo.backfill-v1'

let inflight: Promise<void> | null = null

/**
 * Migración perezosa (Fase 1): a las metas creadas ANTES del modelo nuevo les
 * copia los hitos de su plantilla. Ya NO crea agenda: una meta sin horario es
 * válida (se crea "sin horario" o se saca de la agenda) y no se le inventa uno.
 * Corre una vez por sesión de navegador; es idempotente porque consulta qué
 * metas ya tienen hitos.
 * Single-flight: StrictMode monta el efecto dos veces en dev; sin esta guarda,
 * dos corridas concurrentes duplicarían filas (no hay unique en la BD).
 */
export async function ensureCommitmentBackfill(userId: string, goals: Goal[]): Promise<void> {
  if (inflight) return inflight
  inflight = run(userId, goals).finally(() => {
    inflight = null
  })
  return inflight
}

async function run(userId: string, goals: Goal[]): Promise<void> {
  try {
    if (sessionStorage.getItem(FLAG)) return
  } catch {
    /* sin sessionStorage igual seguimos: el chequeo de abajo es la verdad */
  }

  if (goals.some((g) => g.status === 'active' || g.status === 'paused')) {
    const withMilestones = await goalIdsWithMilestones(userId)
    for (const goal of goalsMissingMilestones(goals, withMilestones)) {
      await createMilestones(
        userId,
        goal.id,
        buildMilestonesFromTemplate(getTemplate(goal.templateKey), 0),
      )
    }
  }

  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* ignore */
  }
}
