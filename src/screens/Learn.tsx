import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { getGoal } from '@/services/goals'
import { listLessonReads, pushLessonReads, setLessonRead } from '@/services/learn'
import type { LearnLesson, NicheId } from '@/lib/types'
import { LEARN_COLLECTIONS } from '@/content/learn'
import { seedWizardDraft } from '@/lib/wizardDraft'
import { nicheAccent } from '@/lib/nicheAccent'
import { NicheGlyph } from '@/components/NicheGlyph'
import {
  IconBack,
  IconBook,
  IconCheck,
  IconChevronRight,
  IconLightbulb,
} from '@/components/icons'

/** Modo de lectura de una lección: resumen (~80 palabras) o a fondo (250-350). */
type ReadMode = 'resumen' | 'fondo'

/** Minutos estimados de lectura (~180 ppm), mínimo 1: baja la barrera de entrada. */
function readingMinutes(lesson: LearnLesson, mode: ReadMode = 'resumen'): number {
  const body = mode === 'fondo' ? lesson.ideaLong : lesson.idea
  const words = `${body} ${lesson.apply}`.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 180))
}

/** Delay escalonado para la entrada en cascada (.learn-enter). */
function stagger(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

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

/** Clave en localStorage con el modo de lectura preferido ('resumen' | 'fondo'). */
const MODE_KEY = 'logralo-learn-mode'

/** Lee el modo preferido. Default 'resumen': la puerta de entrada es la corta. */
function loadMode(): ReadMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'fondo' ? 'fondo' : 'resumen'
  } catch {
    return 'resumen'
  }
}

function saveMode(mode: ReadMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* sin localStorage la preferencia dura solo la sesión: aceptable */
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
  const { userId, profile } = useSession()
  const [read, setRead] = useState<Set<string>>(loadRead)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(null)
  // Modo de lectura (Resumen / A fondo). Es una preferencia, no progreso:
  // vive solo en localStorage y aplica a todas las lecciones por igual.
  const [mode, setMode] = useState<ReadMode>(loadMode)

  function changeMode(next: ReadMode) {
    setMode(next)
    saveMode(next)
  }

  // Sync suave con la cuenta: la BD es la verdad compartida entre dispositivos y
  // localStorage el cache. Sin red (o sin migración 0011) todo sigue funcionando.
  useEffect(() => {
    let active = true
    listLessonReads(userId)
      .then((server) => {
        if (!active) return
        setRead((local) => {
          const merged = new Set([...local, ...server])
          saveRead(merged)
          // Lo leído en este dispositivo que el servidor no tiene, se sube.
          const localOnly = [...local].filter((id) => !server.has(id))
          void pushLessonReads(userId, localOnly).catch(() => {})
          return merged
        })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [userId])

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
      const willBeRead = !next.has(id)
      if (willBeRead) next.add(id)
      else next.delete(id)
      saveRead(next)
      // Mejor esfuerzo hacia la cuenta: si falla, el cache local ya quedó bien.
      void setLessonRead(userId, id, willBeRead).catch(() => {})
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
    const lessonIndex = collection.lessons.findIndex((l) => l.id === lesson.id)
    const nextLesson = collection.lessons[lessonIndex + 1] ?? null
    return (
      <div className="screen" style={nicheAccent(collection.area)}>
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

        {/* key = re-monta el contenido al pasar de lección: la cascada de entrada
            vuelve a correr y el cambio se siente como pasar de página. */}
        <div className="stack" key={lesson.id}>
          <div
            className="row row--between learn-enter"
            style={{ alignItems: 'center', ...stagger(0) }}
          >
            <span className="lesson-dots" aria-hidden="true">
              {collection.lessons.map((l) => (
                <span
                  key={l.id}
                  data-read={read.has(l.id) || undefined}
                  data-current={l.id === lesson.id || undefined}
                />
              ))}
            </span>
            <span className="faint tiny">
              Lección {lessonIndex + 1} de {collection.lessons.length}
            </span>
          </div>

          {/* Dos modos del mismo cuerpo: resumen o a fondo. Los minutos van en
              cada opción para que el costo de cada modo se vea antes de elegir. */}
          <div
            className="seg learn-enter"
            role="tablist"
            aria-label="Modo de lectura"
            style={stagger(1)}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'resumen'}
              className={`seg__btn${mode === 'resumen' ? ' seg__btn--active' : ''}`}
              onClick={() => changeMode('resumen')}
            >
              Resumen · {readingMinutes(lesson, 'resumen')} min
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'fondo'}
              className={`seg__btn${mode === 'fondo' ? ' seg__btn--active' : ''}`}
              onClick={() => changeMode('fondo')}
            >
              A fondo · {readingMinutes(lesson, 'fondo')} min
            </button>
          </div>

          {/* key por modo: al cambiar de modo el cuerpo re-anima como pasar de
              página. Solo el primer párrafo lleva capitular. */}
          {(mode === 'fondo' ? lesson.ideaLong : lesson.idea).split('\n\n').map((para, i) => (
            <p
              key={`${mode}-${i}`}
              className={`lesson-idea learn-enter${i > 0 ? ' lesson-idea--follow' : ''}`}
              style={stagger(2)}
            >
              {para}
            </p>
          ))}

          <section
            className="card card--tight stack stack--sm lesson-apply learn-enter"
            style={stagger(3)}
            aria-label="Aplícalo hoy"
          >
            <span className="kicker row row--sm" style={{ alignItems: 'center' }}>
              <IconLightbulb size={14} /> Aplícalo hoy
            </span>
            <p className="small" style={{ margin: 0 }}>
              {lesson.apply}
            </p>
          </section>

          <div className="stack stack--sm learn-enter" style={stagger(4)}>
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

            {/* Avanzar dentro de la colección sin salir y volver a entrar cada vez.
                En la última lección, cerrar la colección en vez de dejar sin salida. */}
            {nextLesson ? (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={() => setLessonId(nextLesson.id)}
              >
                Siguiente lección: {nextLesson.title} →
              </button>
            ) : (
              <button
                type="button"
                className="btn--link"
                style={{ alignSelf: 'center' }}
                onClick={() => setLessonId(null)}
              >
                Terminaste {collection.title} · volver a la colección
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ----- Vista de colección ----------------------------------------------- */
  if (collection) {
    const readCount = collection.lessons.filter((l) => read.has(l.id)).length
    const nextUnread = collection.lessons.find((l) => !read.has(l.id)) ?? null
    return (
      <div className="screen" style={nicheAccent(collection.area)}>
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
            <span className="row row--sm" style={{ alignItems: 'center' }}>
              <NicheGlyph area={collection.area} size="sm" />
              <h1 className="screen__title" style={{ fontSize: 'var(--fs-xl)' }}>
                {collection.title}
              </h1>
            </span>
            <p className="muted small" style={{ margin: 0 }}>
              {collection.blurb}
            </p>
          </div>
        </header>

        <div className="stack stack--sm learn-enter" style={{ ...stagger(0), marginBottom: 'var(--s4)' }}>
          <div className="learn-card__bar">
            <span style={{ width: `${(readCount / collection.lessons.length) * 100}%` }} />
          </div>
          <span className="faint tiny">
            {readCount === collection.lessons.length
              ? 'Colección completa. Releer también cuenta.'
              : `${readCount} de ${collection.lessons.length} leídas`}
          </span>
        </div>

        <div className="stack stack--sm">
          {collection.lessons.map((l, i) => {
            const isRead = read.has(l.id)
            const isNext = nextUnread?.id === l.id
            return (
              <button
                key={l.id}
                type="button"
                className={`card card--tight row lesson-row learn-enter${isRead ? ' lesson-row--read' : ''}${isNext ? ' lesson-row--next' : ''}`}
                style={stagger(i + 1)}
                onClick={() => setLessonId(l.id)}
              >
                <span className="lesson-row__num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                  <strong className="nowrap-ellipsis">{l.title}</strong>
                  <span className="faint tiny">
                    {readingMinutes(l)} min de lectura
                    {isNext && readCount > 0 ? ' · sigue aquí' : ''}
                  </span>
                </span>
                {/* Indicador de lectura, no botón: se marca dentro de la lección. */}
                {isRead ? (
                  <span className="check check--done" role="img" aria-label="Lección leída">
                    <IconCheck size={16} />
                  </span>
                ) : (
                  <IconChevronRight size={16} style={{ color: 'var(--text-faint)', flex: 'none' }} />
                )}
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
          {collections.map((c, i) => {
            const readCount = c.lessons.filter((l) => read.has(l.id)).length
            const nextUnread = c.lessons.find((l) => !read.has(l.id)) ?? null
            const totalMinutes = c.lessons.reduce((sum, l) => sum + readingMinutes(l), 0)
            const complete = readCount === c.lessons.length
            return (
              <button
                key={c.id}
                type="button"
                className="card learn-card stack stack--sm learn-enter"
                style={{ ...nicheAccent(c.area), ...stagger(i) }}
                onClick={() => setCollectionId(c.id)}
              >
                <span className="row row--sm" style={{ alignItems: 'center', minWidth: 0 }}>
                  <NicheGlyph area={c.area} size="md" />
                  <strong className="nowrap-ellipsis">{c.title}</strong>
                  {focusArea === c.area && <span className="tag tag--niche">Para tu foco</span>}
                </span>
                <p className="muted small" style={{ margin: 0 }}>
                  {c.blurb}
                </p>
                {readCount > 0 && (
                  <span className="learn-card__bar">
                    <span style={{ width: `${(readCount / c.lessons.length) * 100}%` }} />
                  </span>
                )}
                {complete ? (
                  <span className="row row--sm faint tiny" style={{ alignItems: 'center' }}>
                    <IconCheck size={14} style={{ color: 'var(--success)' }} /> Colección completa
                  </span>
                ) : nextUnread && readCount > 0 ? (
                  <span className="learn-card__next nowrap-ellipsis">
                    Sigue: {nextUnread.title} →
                  </span>
                ) : (
                  <span className="faint tiny">
                    {c.lessons.length} lecciones · {totalMinutes} min en total
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
