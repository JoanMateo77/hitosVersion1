import { useEffect, useRef, useState } from 'react'
import type { Goal, Habit } from '@/lib/types'
import { daysLabel, progressLabel } from '@/domain/habits'
import { NICHES, getNiche } from '@/domain/niches'
import { relativeDeadline } from '@/lib/date'
import { milestoneProgressByGoal } from '@/services/milestones'
import { HabitIcon } from '@/components/HabitIcon'
import { NicheIcon } from '@/components/NicheGlyph'
import { IconChevronRight, IconPlus } from '@/components/icons'
import type { HabitDraft } from '@/screens/habits/habitDraft'

/** Avance de hitos por meta ("Etapa 2 de 4"); vacío si no se pudo cargar. */
type Progress = Map<string, { done: number; total: number; nextTitle: string | null }>

/**
 * Paso 3: confirmar. Primero cómo se verá la fila en Hoy, después dónde vive
 * (área) y a qué meta suma. El avance de hitos se pide aquí y es opcional: si
 * falla, las metas se muestran igual con su fecha.
 */
export function SheetStepConfirm({
  draft,
  patch,
  goals,
  userId,
}: {
  draft: HabitDraft
  patch: (over: Partial<HabitDraft>) => void
  goals: Goal[]
  userId: string
}) {
  const [areasOpen, setAreasOpen] = useState(false)
  const [progress, setProgress] = useState<Progress>(new Map())
  const goalsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    milestoneProgressByGoal(userId)
      .then((map) => {
        if (alive) setProgress(map)
      })
      .catch(() => {
        // Sin etapas la hoja funciona igual: solo se pierde el "Etapa 2 de 4".
        if (alive) setProgress(new Map())
      })
    return () => {
      alive = false
    }
  }, [userId])

  const target = Math.max(1, draft.timesPerDay)
  const linked = goals.find((g) => g.id === draft.goalId) ?? null
  // El hábito que aún no existe, para que los textos salgan del dominio y no
  // haya una segunda voz ("0 de 5 vasos") escrita a mano en la hoja.
  const preview: Habit = {
    id: 'preview',
    userId,
    title: draft.title,
    area: draft.area,
    weekdays: draft.weekdays,
    times: null,
    icon: draft.icon,
    color: draft.color,
    unit: draft.unit,
    timesPerDay: target,
    pausedUntil: null,
    goalId: draft.goalId,
    createdAt: '',
    archivedAt: null,
  }

  /** "Etapa 2 de 4 · faltan 24 días" (lo que haya de las dos partes). */
  function goalCaption(goal: Goal): string | null {
    const parts: string[] = []
    const stats = progress.get(goal.id)
    if (stats && stats.total > 0) {
      parts.push(`Etapa ${Math.min(stats.done + 1, stats.total)} de ${stats.total}`)
    }
    const deadline = relativeDeadline(goal.targetDate)
    if (deadline) parts.push(deadline)
    return parts.length > 0 ? parts.join(' · ') : null
  }

  return (
    <>
      <section className="hsheet-group">
        <span className="hab-kicker">Vista previa</span>
        <div className="hsheet-preview" data-color={draft.color}>
          <HabitIcon icon={draft.icon} color={draft.color} size="md" />
          <div className="hsheet-preview__main">
            <span className="hsheet-preview__title">
              {draft.title.trim() || 'Nuevo hábito'}
            </span>
            {target > 1 ? (
              <div className="hsheet-preview__meter">
                <div className="hsheet-slots">
                  {Array.from({ length: target }, (_, i) => (
                    <span className="hsheet-slot" key={i} />
                  ))}
                </div>
                <span className="hsheet-preview__sub">{progressLabel(preview, 0)}</span>
              </div>
            ) : (
              <span className="hsheet-preview__sub">{daysLabel(draft.weekdays)}</span>
            )}
          </div>
          {target > 1 ? (
            <span className="hsheet-preview__add" aria-hidden="true">
              <IconPlus size={18} />
            </span>
          ) : (
            <span className="hsheet-preview__ring" aria-hidden="true" />
          )}
        </div>
      </section>

      <div className="hsheet-card">
        <button
          type="button"
          className="hsheet-row hsheet-row--tap"
          aria-expanded={areasOpen}
          onClick={() => setAreasOpen((v) => !v)}
        >
          <span className="hsheet-row__label">Área</span>
          <span className="hsheet-row__value">{getNiche(draft.area).label}</span>
          <IconChevronRight size={16} className="hsheet-row__chevron" />
        </button>
        {areasOpen && (
          <div className="hsheet-options">
            {NICHES.map((niche) => (
              <button
                key={niche.id}
                type="button"
                className="hsheet-option"
                aria-pressed={draft.area === niche.id}
                onClick={() => {
                  patch({ area: niche.id })
                  setAreasOpen(false)
                }}
              >
                <span className="hsheet-option__label">{niche.label}</span>
                <span className="hsheet-radio" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        {goals.length > 0 ? (
          <button
            type="button"
            className="hsheet-row hsheet-row--tap"
            onClick={() => {
              goalsRef.current?.scrollIntoView({ block: 'nearest' })
              goalsRef.current?.querySelector('button')?.focus()
            }}
          >
            <span className="hsheet-row__label">Meta vinculada</span>
            <span className="hsheet-row__value">{linked ? linked.title : 'Ninguna'}</span>
            <IconChevronRight size={16} className="hsheet-row__chevron" />
          </button>
        ) : (
          <div className="hsheet-row">
            <span className="hsheet-row__label">Meta vinculada</span>
            <span className="hsheet-row__value">Ninguna</span>
          </div>
        )}
      </div>

      <section className="hsheet-group">
        <span className="hab-kicker">Metas activas</span>
        {goals.length === 0 ? (
          <p className="hsheet-note">No tienes metas activas. Puedes vincularlo después.</p>
        ) : (
          <div className="hsheet-goals" ref={goalsRef}>
            {goals.map((goal) => {
              const caption = goalCaption(goal)
              const on = draft.goalId === goal.id
              return (
                <button
                  key={goal.id}
                  type="button"
                  className="hsheet-goal"
                  aria-pressed={on}
                  onClick={() => patch({ goalId: on ? null : goal.id })}
                >
                  <span className="hsheet-goal__glyph" aria-hidden="true">
                    <NicheIcon area={goal.area} size={18} />
                  </span>
                  <span className="hsheet-goal__main">
                    <span className="hsheet-goal__title">{goal.title}</span>
                    {caption && <span className="hsheet-goal__sub">{caption}</span>}
                  </span>
                  <span className="hsheet-radio" aria-hidden="true" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      <p className="hsheet-note">
        Si lo vinculas, este hábito suma al avance de la meta. Puedes cambiarlo después.
      </p>
    </>
  )
}
