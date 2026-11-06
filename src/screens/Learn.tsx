import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { getGoal } from '@/services/goals'
import { listLessonReads, pushLessonReads, setLessonRead } from '@/services/learn'
import type { LearnCollection, LearnLesson, NicheId } from '@/lib/types'
import { LEARN_COLLECTIONS } from '@/content/learn'
import { seedWizardDraft } from '@/lib/wizardDraft'
import { nicheAccent } from '@/lib/nicheAccent'
import { NicheGlyph, NicheIcon } from '@/components/NicheGlyph'
import {
  IconBook,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPlay,
} from '@/components/icons'

/** Modo de lectura de una lección: resumen (~80 palabras) o a fondo (250-350). */
type ReadMode = 'resumen' | 'fondo'

/** Minutos estimados de lectura (~180 ppm), mínimo 1: baja la barrera de entrada. */
function readingMinutes(lesson: LearnLesson, mode: ReadMode = 'resumen'): number {
  const body = mode === 'fondo' ? lesson.ideaLong : lesson.idea
  const words = `${body} ${lesson.apply}`.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 180))
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

/** Una lección: modo de lectura, "Aplícalo hoy", leída y paso siguiente. */
function LessonView({
  collection,
  lesson,
  read,
  mode,
  onMode,
  onToggleRead,
  onCta,
  onOpenLesson,
}: Readonly<{
  collection: LearnCollection
  lesson: LearnLesson
  read: Set<string>
  mode: ReadMode
  onMode: (mode: ReadMode) => void
  onToggleRead: (id: string) => void
  onCta: (cta: NonNullable<LearnLesson['cta']>) => void
  /** null = volver a la colección. */
  onOpenLesson: (id: string | null) => void
}>) {
  const isRead = read.has(lesson.id)
  const lessonIndex = collection.lessons.findIndex((l) => l.id === lesson.id)
  const nextLesson = collection.lessons[lessonIndex + 1] ?? null
  return (
    <div className="screen" style={nicheAccent(collection.area)}>
      {/* Cabecera full color: el color del área dice de qué colección se lee. */}
      <header className="screen__header fc-hero learn-hero">
        <button type="button" className="back-link" onClick={() => onOpenLesson(null)}>
          <IconChevronLeft size={18} />
          Colección
        </button>
        <div className="learn-hero__text">
          <span className="section-title learn-hero__kicker">
            <NicheGlyph area={collection.area} size="sm" />
            {collection.title}
          </span>
          <h1 className="learn-hero__title">{lesson.title}</h1>
        </div>
      </header>

      {/* key = re-monta el contenido al pasar de lección (estado de scroll y
          foco limpios, como pasar de página). */}
      <div className="stack" key={lesson.id}>
        <div className="row row--between" style={{ alignItems: 'center' }}>
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
        <div className="seg" role="tablist" aria-label="Modo de lectura">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'resumen'}
            className={`seg__btn${mode === 'resumen' ? ' seg__btn--active' : ''}`}
            onClick={() => onMode('resumen')}
          >
            Resumen · {readingMinutes(lesson, 'resumen')} min
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'fondo'}
            className={`seg__btn${mode === 'fondo' ? ' seg__btn--active' : ''}`}
            onClick={() => onMode('fondo')}
          >
            A fondo · {readingMinutes(lesson, 'fondo')} min
          </button>
        </div>

        {/* Solo el primer párrafo lleva capitular. */}
        {(mode === 'fondo' ? lesson.ideaLong : lesson.idea).split('\n\n').map((para, i) => (
          <p
            key={`${mode}-${i}`}
            className={`lesson-idea${i > 0 ? ' lesson-idea--follow' : ''}`}
          >
            {para}
          </p>
        ))}

        <section
          className="card card--tight stack stack--sm lesson-apply"
          aria-label="Aplícalo hoy"
        >
          <h2 className="section-title row row--sm" style={{ alignItems: 'center' }}>
            <IconPlay size={14} /> Aplícalo hoy
          </h2>
          <p className="small" style={{ margin: 0 }}>
            {lesson.apply}
          </p>
        </section>

        <div className="stack stack--sm">
          <button
            type="button"
            className="btn btn--secondary btn--block"
            aria-pressed={isRead}
            onClick={() => onToggleRead(lesson.id)}
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
              onClick={() => lesson.cta && onCta(lesson.cta)}
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
              className="btn btn--secondary btn--block"
              onClick={() => onOpenLesson(nextLesson.id)}
            >
              Siguiente lección: {nextLesson.title} →
            </button>
          ) : (
            <button
              type="button"
              className="btn--link"
              style={{ alignSelf: 'center' }}
              onClick={() => onOpenLesson(null)}
            >
              Terminaste {collection.title} · volver a la colección
            </button>
          )}
        </div>
      </div>
    </div>
  )
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
    return (
      <LessonView
        collection={collection}
        lesson={lesson}
        read={read}
        mode={mode}
        onMode={changeMode}
        onToggleRead={toggleRead}
        onCta={followCta}
        onOpenLesson={setLessonId}
      />
    )
  }

  /* ----- Vista de colección ----------------------------------------------- */
  if (collection) {
    const readCount = collection.lessons.filter((l) => read.has(l.id)).length
    const nextUnread = collection.lessons.find((l) => !read.has(l.id)) ?? null
    return (
      <div className="screen" style={nicheAccent(collection.area)}>
        <header className="screen__header fc-hero learn-hero">
          <button type="button" className="back-link" onClick={() => setCollectionId(null)}>
            <IconChevronLeft size={18} />
            Aprender
          </button>
          <div className="learn-hero__text">
            <span className="section-title learn-hero__kicker">
              <NicheGlyph area={collection.area} size="sm" />
              Colección
            </span>
            <h1 className="learn-hero__title">{collection.title}</h1>
            <p className="learn-hero__blurb">{collection.blurb}</p>
            <div className="learn-hero__progress">
              <span className="progress" aria-hidden="true">
                <span
                  className="progress__bar"
                  style={{ width: `${(readCount / collection.lessons.length) * 100}%` }}
                />
              </span>
              <span className="learn-hero__count">
                {readCount === collection.lessons.length
                  ? 'Colección completa. Releer también cuenta.'
                  : `${readCount} de ${collection.lessons.length} leídas`}
              </span>
            </div>
          </div>
        </header>

        <div className="stack stack--sm">
          {collection.lessons.map((l, i) => {
            const isRead = read.has(l.id)
            const isNext = nextUnread?.id === l.id
            return (
              <button
                key={l.id}
                type="button"
                className={`card card--tight row lesson-row${isRead ? ' lesson-row--read' : ''}${isNext ? ' lesson-row--next' : ''}`}
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
  // La "siguiente": la primera empezada sin terminar; si no hay, la primera sin
  // terminar (las del foco van primero). Solo esa se destaca (borde + etiqueta).
  const unfinished = collections.filter((c) => c.lessons.some((l) => !read.has(l.id)))
  const featuredId =
    (unfinished.find((c) => c.lessons.some((l) => read.has(l.id))) ?? unfinished[0])?.id ?? null
  return (
    <div className="screen">
      <header className="screen__header">
        <p className="muted small">Crece cada día</p>
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
        <div className="stack stack--sm learn-grid">
          {collections.map((c) => {
            const readCount = c.lessons.filter((l) => read.has(l.id)).length
            const nextUnread = c.lessons.find((l) => !read.has(l.id)) ?? null
            const totalMinutes = c.lessons.reduce((sum, l) => sum + readingMinutes(l), 0)
            const complete = readCount === c.lessons.length
            // Todas neutras: ninguna meta del usuario las respalda, así que no
            // llevan color de área. La siguiente para leer se distingue por
            // borde y la etiqueta "Sigue aquí", no por color.
            const featured = c.id === featuredId
            return (
              <button
                key={c.id}
                type="button"
                className={`fc-card fc-card--neutral learn-card${featured ? ' learn-card--featured' : ''}`}
                onClick={() => setCollectionId(c.id)}
              >
                <span className="learn-card__top">
                  <span className="learn-card__icon" aria-hidden="true">
                    <NicheIcon area={c.area} size={19} />
                  </span>
                  <span className="learn-card__tags">
                    {focusArea === c.area && <span className="tag">Para tu foco</span>}
                    {featured && <span className="tag">Sigue aquí</span>}
                  </span>
                </span>
                <span className="fc-card__title">{c.title}</span>
                <p className="learn-card__blurb">{c.blurb}</p>
                {readCount > 0 && (
                  <span className="progress" aria-hidden="true">
                    <span className="progress__bar" style={{ width: `${(readCount / c.lessons.length) * 100}%` }} />
                  </span>
                )}
                {complete && (
                  <span className="fc-card__meta learn-card__done">
                    <IconCheck size={14} /> Colección completa
                  </span>
                )}
                {!complete && nextUnread && readCount > 0 && (
                  <span className="fc-card__meta learn-card__next nowrap-ellipsis">
                    Sigue: {nextUnread.title} →
                  </span>
                )}
                {!complete && readCount === 0 && (
                  <span className="fc-card__meta">
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
