import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { getGoal } from '@/services/goals'
import type { LearnLesson, NicheId } from '@/lib/types'
import { LEARN_COLLECTIONS } from '@/content/learn'
import { seedWizardDraft } from '@/lib/wizardDraft'
import { NicheGlyph } from '@/components/NicheGlyph'
import {
  IconBack,
  IconBook,
  IconCheck,
  IconChevronRight,
  IconLightbulb,
} from '@/components/icons'

/** Clave en localStorage con los ids de lección ya leídos (array JSON). */
const READ_KEY = 'logralo-learn-read'

/** Lee el progreso guardado. Si localStorage falla, se empieza de cero: leer
 *  es contenido estático, perder el progreso no rompe nada. */
function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function saveRead(ids: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]))
  } catch {
    /* sin localStorage el progreso dura solo la sesión: aceptable */
  }
}

/**
 * Aprender: micro-lecciones de crecimiento personal organizadas en colecciones.
 * Tres niveles (colecciones → colección → lección) navegados con estado interno
 * en vez de rutas: es contenido liviano y así el botón "volver" nunca saca al
 * usuario de la pantalla por accidente.
 */
export function Learn() {
  const navigate = useNavigate()
  const { profile } = useSession()
  const [read, setRead] = useState<Set<string>>(loadRead)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(null)

  // Foco del usuario: el área de su meta prioritaria ⭐, o el nicho del perfil.
  // El contenido encuentra al usuario en su contexto, no al revés.
  const [focusArea, setFocusArea] = useState<NicheId | null>(profile.primaryNiche)
  useEffect(() => {
    if (!profile.priorityGoalId) return
    let active = true
    getGoal(profile.priorityGoalId)
      .then((g) => {
        if (active && g) setFocusArea(g.area)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [profile.priorityGoalId])

  const collection = LEARN_COLLECTIONS.find((c) => c.id === collectionId) ?? null
  const lesson = collection?.lessons.find((l) => l.id === lessonId) ?? null

  function toggleRead(id: string) {
    setRead((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveRead(next)
      return next
    })
  }

  /** Convierte la lección en acción real: hábito prellenado o meta sembrada. */
  function followCta(cta: NonNullable<LearnLesson['cta']>) {
    if (cta.kind === 'habit') {
      navigate(`/habitos?nuevo=${encodeURIComponent(cta.title)}&area=${cta.area}`)
    } else {
      // La meta se siembra sin etapas: el wizard guía el resto del contrato.
      seedWizardDraft({ title: cta.title, templateKey: 'personalizada', area: cta.area, milestones: [] })
      navigate('/meta/nueva')
    }
  }

  /* ----- Vista de lección ------------------------------------------------ */
  if (collection && lesson) {
    const isRead = read.has(lesson.id)
    return (
      <div className="screen">
        <header className="screen__header row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
          <button
            type="button"
            className="iconbtn"
            aria-label={`Volver a ${collection.title}`}
            onClick={() => setLessonId(null)}
          >
            <IconBack size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
            <span className="kicker">{collection.title}</span>
            <h1 className="screen__title" style={{ fontSize: 'var(--fs-xl)' }}>
              {lesson.title}
            </h1>
          </div>
        </header>

        <div className="stack">
          <p style={{ margin: 0 }}>{lesson.idea}</p>

          <section className="card card--tight stack stack--sm" aria-label="Aplícalo hoy">
            <span className="kicker row row--sm" style={{ alignItems: 'center' }}>
              <IconLightbulb size={14} /> Aplícalo hoy
            </span>
            <p className="small" style={{ margin: 0 }}>
              {lesson.apply}
            </p>
          </section>

          <button
            type="button"
            className={`btn btn--block ${isRead ? 'btn--subtle' : 'btn--ghost'}`}
            aria-pressed={isRead}
            onClick={() => toggleRead(lesson.id)}
          >
            {isRead ? (
              <>
                <IconCheck size={16} style={{ color: 'var(--success)' }} /> Leída
              </>
            ) : (
              'Marcar como leída'
            )}
          </button>

          {lesson.cta && (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => lesson.cta && followCta(lesson.cta)}
            >
              {lesson.cta.kind === 'habit'
                ? `Crear el hábito: ${lesson.cta.title}`
                : `Crear la meta: ${lesson.cta.title}`}
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ----- Vista de colección ----------------------------------------------- */
  if (collection) {
    const readCount = collection.lessons.filter((l) => read.has(l.id)).length
    return (
      <div className="screen">
        <header className="screen__header row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
          <button
            type="button"
            className="iconbtn"
            aria-label="Volver a las colecciones"
            onClick={() => setCollectionId(null)}
          >
            <IconBack size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 className="screen__title" style={{ fontSize: 'var(--fs-xl)' }}>
              {collection.title}
            </h1>
            <p className="muted small" style={{ margin: 0 }}>
              {readCount} de {collection.lessons.length} leídas
            </p>
          </div>
        </header>

        <div className="stack stack--sm">
          {collection.lessons.map((l) => {
            const isRead = read.has(l.id)
            return (
              <button
                key={l.id}
                type="button"
                className="card card--tight row row--between"
                style={{ width: '100%', textAlign: 'left', alignItems: 'center' }}
                onClick={() => setLessonId(l.id)}
              >
                <span className="row row--sm" style={{ alignItems: 'center', minWidth: 0 }}>
                  {/* Indicador de lectura, no botón: se marca dentro de la lección. */}
                  <span
                    className={`check${isRead ? ' check--done' : ''}`}
                    role="img"
                    aria-label={isRead ? 'Lección leída' : 'Lección pendiente'}
                  >
                    <IconCheck size={16} />
                  </span>
                  <strong className="nowrap-ellipsis">{l.title}</strong>
                </span>
                <IconChevronRight size={16} style={{ color: 'var(--text-faint)', flex: 'none' }} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ----- Vista de colecciones (raíz) -------------------------------------- */
  // Las colecciones de tu foco van primero (sort estable: el resto no cambia).
  const collections = focusArea
    ? [...LEARN_COLLECTIONS].sort(
        (a, b) => (a.area === focusArea ? 0 : 1) - (b.area === focusArea ? 0 : 1),
      )
    : LEARN_COLLECTIONS
  return (
    <div className="screen">
      <header className="screen__header">
        <span className="kicker">Crece cada día</span>
        <h1 className="screen__title">Aprender</h1>
      </header>

      {/* Segmento Progreso/Aprender: misma zona del shell, dos miradas. */}
      <div className="seg" role="tablist" aria-label="Progreso o Aprender" style={{ marginBottom: 'var(--s4)' }}>
        <button type="button" role="tab" aria-selected={false} className="seg__btn" onClick={() => navigate('/progreso')}>
          Progreso
        </button>
        <button type="button" role="tab" aria-selected={true} className="seg__btn seg__btn--active">
          Aprender
        </button>
      </div>

      {LEARN_COLLECTIONS.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">
            <IconBook size={30} />
          </span>
          <p className="empty__title">Pronto habrá lecciones aquí</p>
        </div>
      ) : (
        <div className="stack stack--sm">
          {collections.map((c) => {
            const readCount = c.lessons.filter((l) => read.has(l.id)).length
            return (
              <button
                key={c.id}
                type="button"
                className="card stack stack--sm"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setCollectionId(c.id)}
              >
                <span className="row row--sm" style={{ alignItems: 'center', minWidth: 0 }}>
                  <NicheGlyph area={c.area} size="sm" />
                  <strong className="nowrap-ellipsis">{c.title}</strong>
                  {focusArea === c.area && <span className="tag">Para tu foco</span>}
                </span>
                <p className="muted small" style={{ margin: 0 }}>
                  {c.blurb}
                </p>
                <span className="faint tiny">
                  {c.lessons.length} lecciones · {readCount} leídas
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
