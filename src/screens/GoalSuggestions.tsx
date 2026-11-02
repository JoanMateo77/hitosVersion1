import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { suggestionsForNiche, type GoalSeed } from '@/domain/recommendations'
import { getTemplate } from '@/domain/templates'
import { NICHES, getNiche } from '@/domain/niches'
import { buildMilestonesFromTemplate } from '@/domain/commitment'
import { seedWizardDraft } from '@/lib/wizardDraft'
import type { NicheId } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconChevronLeft, IconChevronRight, IconPencil } from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'

/**
 * Recomendación al inicio (doc 5.1): cuando el usuario no sabe qué meta poner,
 * en vez de un formulario vacío le ofrecemos 2-3 metas concretas para adoptar
 * con un toque. También sirve de "próximo paso" al cumplir una meta (?area=).
 */
export function GoalSuggestions() {
  const { profile } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  // Volver al origen real (Metas, Detalle, Hoy…). En un deep-link directo, sin
  // historial in-app (location.key === 'default'), caemos a /metas.
  const goBack = () => (location.key === 'default' ? navigate('/metas') : navigate(-1))

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
      // área por defecto de la plantilla (que a veces difiere). Excepción: en
      // "otra" las sugerencias son de varias áreas — ahí manda la plantilla,
      // para que la meta quede bajo su área real (color y gráficas correctos).
      area: niche === 'otra' ? getTemplate(seed.templateKey).defaultArea : niche,
      milestones: buildMilestonesFromTemplate(getTemplate(seed.templateKey), 0),
    })
    navigate('/meta/nueva')
  }

  return (
    <div className="screen screen--full flow-screen flow-screen--wide">
      <button type="button" className="back-link" style={{ alignSelf: 'flex-start' }} onClick={goBack}>
        <IconChevronLeft size={18} />
        Atrás
      </button>

      <header className="screen__header" style={{ marginTop: 'var(--s2)' }}>
        {niche !== 'otra' && (
          <span className="ideas__area" style={nicheAccent(niche)}>
            {nicheInfo.label}
          </span>
        )}
        <h1 className="screen__title">Ideas para ti</h1>
        <p className="screen__subtitle">
          {niche === 'otra'
            ? 'Metas listas para empezar, cada una con sus etapas típicas. Elige una o escribe la tuya.'
            : `Ideas de ${nicheInfo.label.toLowerCase()}, con etapas listas para empezar. Elige una o escribe la tuya.`}
        </p>
      </header>

      <ul className="stack stack--sm suggestions-grid ideas-list" style={{ flex: 1 }}>
        {suggestions.map((seed) => {
          const template = getTemplate(seed.templateKey)
          // Cada idea va en el color del área en que quedará la meta (en "otra"
          // las ideas son de varias áreas: manda la de su plantilla).
          const area: NicheId = niche === 'otra' ? template.defaultArea : niche
          return (
            <li key={seed.title}>
              <button
                type="button"
                className="idea-card fc-press"
                style={nicheAccent(area)}
                onClick={() => adopt(seed)}
              >
                <NicheGlyph area={area} size="lg" />
                <span className="idea-card__body">
                  <span className="idea-card__title">{seed.title}</span>
                  <span className="idea-card__desc">{template.label}</span>
                </span>
                <IconChevronRight size={18} className="idea-card__go" />
              </button>
            </li>
          )
        })}
      </ul>

      <button
        className="btn btn--ghost btn--block"
        style={{ marginTop: 'var(--s4)' }}
        onClick={() => navigate('/meta/nueva')}
      >
        <IconPencil size={16} /> Escribir mi propia meta
      </button>
    </div>
  )
}
