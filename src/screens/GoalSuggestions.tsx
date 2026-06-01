import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { createGoal } from '@/services/goals'
import { createGoalTasks } from '@/services/tasks'
import { suggestionsForNiche, type GoalSeed } from '@/domain/recommendations'
import { getTemplate } from '@/domain/templates'
import { NICHES, getNiche } from '@/domain/niches'
import { pickAction } from '@/domain/dailyPlan'
import { todayISO } from '@/lib/date'
import { isUniqueViolation } from '@/lib/errors'
import type { NicheId } from '@/lib/types'
import { OptionRow } from '@/components/OptionRow'
import { IconBack } from '@/components/icons'

/**
 * Recomendación al inicio (doc 5.1): cuando el usuario no sabe qué meta poner,
 * en vez de un formulario vacío le ofrecemos 2-3 metas concretas para adoptar
 * con un toque. También sirve de "próximo paso" al cumplir una meta (?area=).
 */
export function GoalSuggestions() {
  const { userId, profile } = useSession()
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

  const [adopting, setAdopting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function adopt(seed: GoalSeed) {
    setAdopting(seed.title)
    setError(null)
    try {
      const goal = await createGoal(userId, {
        title: seed.title,
        why: null,
        targetDate: null,
        // Filamos la meta bajo el nicho que el usuario está mirando, no bajo el
        // área por defecto de la plantilla (que a veces difiere).
        area: niche,
        successCriteria: null,
        templateKey: seed.templateKey,
      })
      try {
        await createGoalTasks(userId, todayISO(), [
          { goalId: goal.id, title: pickAction(goal, todayISO()) },
        ])
      } catch (err) {
        // Solo ignoramos el duplicado (ya existía la acción de hoy); el resto sube.
        if (!isUniqueViolation(err)) throw err
      }
      navigate(`/meta/creada/${goal.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo adoptar la meta.')
      setAdopting(null)
    }
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
              desc={adopting === seed.title ? 'Creando…' : template.label}
              disabled={adopting !== null}
              busy={adopting === seed.title}
              onClick={() => void adopt(seed)}
            />
          )
        })}

        {error && <div className="alert alert--error" role="alert">{error}</div>}
      </div>

      <button
        className="btn btn--ghost btn--block"
        style={{ marginTop: 'var(--s4)' }}
        onClick={() => navigate('/meta/nueva')}
        disabled={adopting !== null}
      >
        ✍️ Escribir mi propia meta
      </button>
    </div>
  )
}
