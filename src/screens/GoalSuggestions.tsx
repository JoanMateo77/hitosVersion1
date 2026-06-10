import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { suggestionsForNiche, type GoalSeed } from '@/domain/recommendations'
import { getTemplate } from '@/domain/templates'
import { NICHES, getNiche } from '@/domain/niches'
import { buildMilestonesFromTemplate } from '@/domain/commitment'
import { seedWizardDraft } from '@/lib/wizardDraft'
import type { NicheId } from '@/lib/types'
import { OptionRow } from '@/components/OptionRow'
import { IconBack } from '@/components/icons'

/**
 * Recomendación al inicio (doc 5.1): cuando el usuario no sabe qué meta poner,
 * en vez de un formulario vacío le ofrecemos 2-3 metas concretas para adoptar
 * con un toque. También sirve de "próximo paso" al cumplir una meta (?area=).
 */
export function GoalSuggestions() {
  const { profile } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // El ?area= (flujo "próximo paso") tiene prioridad; si no, el foco del perfil.
  // Validamos el ?area= contra el catálogo: un valor basura cae al foco del perfil,
  // no a 'otra' en silencio (que mostraba un header y sugerencias equivocadas).
  const areaParam = params.get('area')
  const validArea =
    areaParam && NICHES.some((n) => n.id === areaParam) ? (areaParam as NicheId) : null
  const niche: NicheId = validArea ?? profile.primaryNiche ?? 'otra'
  const suggestions = suggestionsForNiche(niche)
  const nicheInfo = getNiche(niche)

  /**
   * Adoptar una idea ya no crea la meta directo: pre-carga el wizard con el
   * título, tipo y etapas, y lleva al usuario al paso de compromiso. Toda meta
   * nace con contrato — sin excepciones (invariante del rediseño 2026-06).
   */
  function adopt(seed: GoalSeed) {
    seedWizardDraft({
      title: seed.title,
      templateKey: seed.templateKey,
      // Filamos la meta bajo el nicho que el usuario está mirando, no bajo el
      // área por defecto de la plantilla (que a veces difiere).
      area: niche,
      milestones: buildMilestonesFromTemplate(getTemplate(seed.templateKey), 0),
    })
    navigate('/meta/nueva')
  }

  return (
    <div className="screen screen--full flow-screen flow-screen--wide">
      <button className="iconbtn" onClick={() => navigate('/')} aria-label="Volver">
        <IconBack />
      </button>

      <header className="screen__header" style={{ marginTop: 'var(--s4)' }}>
        <h1 className="screen__title">Ideas para vos</h1>
        <p className="screen__subtitle">
          Metas concretas para tu foco {nicheInfo.emoji} {nicheInfo.label}. Adoptá una con un toque o
          escribí la tuya.
        </p>
      </header>

      <div className="stack stack--sm suggestions-grid" style={{ flex: 1 }}>
        {suggestions.map((seed) => {
          const template = getTemplate(seed.templateKey)
          return (
            <OptionRow
              key={seed.title}
              emoji={template.emoji}
              label={seed.title}
              desc={template.label}
              onClick={() => adopt(seed)}
            />
          )
        })}
      </div>

      <button
        className="btn btn--ghost btn--block"
        style={{ marginTop: 'var(--s4)' }}
        onClick={() => navigate('/meta/nueva')}
      >
        ✍️ Escribir mi propia meta
      </button>
    </div>
  )
}
