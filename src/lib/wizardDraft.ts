import type { NicheId } from '@/lib/types'
import type { MilestoneDraft } from '@/domain/commitment'

/** Clave única del borrador del wizard en sessionStorage. */
export const WIZARD_DRAFT_KEY = 'logralo.wizard-draft-v2'

/**
 * Pre-carga el borrador del wizard con una meta ya esbozada (p. ej. al adoptar
 * una idea): el usuario aterriza directo en el paso de compromiso, que es lo
 * único que nadie puede elegir por él. Sin esto, adoptar una idea crearía una
 * meta sin contrato — el agujero que el rediseño elimina.
 */
export function seedWizardDraft(seed: {
  title: string
  templateKey: string
  area: NicheId
  milestones: MilestoneDraft[]
}): void {
  try {
    sessionStorage.setItem(
      WIZARD_DRAFT_KEY,
      JSON.stringify({
        step: 2,
        title: seed.title,
        templateKey: seed.templateKey,
        why: '',
        targetDate: '',
        area: seed.area,
        criteria: '',
        blocks: [],
        milestones: seed.milestones,
        seededFromTemplate: seed.templateKey,
        milestonesTouched: false,
      }),
    )
  } catch {
    /* sin sessionStorage el wizard arranca vacío: el flujo sigue siendo válido */
  }
}
