import { useEffect, useRef, type ReactNode } from 'react'
import type { Goal, Session } from '@/lib/types'
import { rangeLabel, sessionSpan } from '@/domain/agenda'
import { elapsedSeconds } from '@/domain/sessions'
import { formatCommitted, formatElapsed, progressLine, SHORT_NICHE_LABELS } from '@/domain/today'
import { goalAccent, goalTone } from '@/lib/goalAccent'
import { NicheGlyph } from '@/components/NicheGlyph'
import { PathIllustration } from '@/components/PathIllustration'
import { IconCheck, IconPlay, IconPlus, IconStop } from '@/components/icons'

/** Progreso de hitos de una meta (etapa X de Y en el héroe). */
export type StageProgress = { done: number; total: number; nextTitle: string | null }

/** " · Etapa 2 de 4" para el héroe; nada si la meta no tiene etapas. */
function stageSuffix(progress: StageProgress | undefined): string {
  if (!progress || progress.total === 0) return ''
  return ` · Etapa ${Math.min(progress.done + 1, progress.total)} de ${progress.total}`
}

/** Franja superior de la tarjeta: estado, dato a la derecha y la meta. */
function HeroBand({ goal, state, meta }: Readonly<{ goal: Goal; state: string; meta: ReactNode }>) {
  return (
    <div className="today-hero__band">
      <div className="today-hero__top">
        <span className="today-hero__state">
          <span className="today-hero__dot" aria-hidden="true" />
          {state}
        </span>
        <span className="today-hero__meta">{meta}</span>
      </div>
      <div className="today-hero__head">
        <NicheGlyph area={goal.area} tone={goalTone(goal)} size="md" />
        <span className="today-hero__title">{goal.title}</span>
      </div>
    </div>
  )
}

interface HeroRunningProps {
  session: Session
  goal: Goal
  stage: StageProgress | undefined
  now: Date
  onContinue: () => void
  onStop: () => void
}

/**
 * Sesión en curso. Es de una meta: la franja superior lleva el color de su
 * área (de qué se habla); el botón azul, la acción.
 */
function HeroRunning({ session, goal, stage, now, onContinue, onStop }: Readonly<HeroRunningProps>) {
  const clock =
    session.targetKind === 'time'
      ? formatElapsed(elapsedSeconds(session, now))
      : `${session.actualValue ?? 0}/${session.targetValue}`
  return (
    <div className="today-hero today-hero--goal" style={goalAccent(goal)}>
      <HeroBand
        goal={goal}
        state={session.pausedAt ? 'Sesión en pausa' : 'Sesión en curso'}
        meta={
          <>
            {SHORT_NICHE_LABELS[goal.area]}
            {stageSuffix(stage)}
          </>
        }
      />
      <div className="today-hero__body">
        <span className="today-hero__sub">{progressLine(session, now)}</span>
        <span className="today-hero__clock">{clock}</span>
      </div>
      <div className="today-hero__actions">
        <button type="button" className="btn btn--primary today-hero__cta" onClick={onContinue}>
          <IconPlay size={16} /> Continuar sesión
        </button>
        <button type="button" className="today-hero__square" aria-label="Terminar la sesión" onClick={onStop}>
          <IconStop size={18} />
        </button>
      </div>
    </div>
  )
}

/** Hora de la siguiente sesión ("7:00 – 7:30 am") o "Sin hora". */
function pendingTimeLabel(session: Session): string {
  const span = sessionSpan(session.plannedTime, session.targetKind, session.targetValue)
  return span.start ? rangeLabel(span.start, span.end) : 'Sin hora'
}

function HeroPending({ session, goal, onStart }: Readonly<{ session: Session; goal: Goal; onStart: () => void }>) {
  const committed =
    session.targetKind === 'time' ? `${formatCommitted(session)} comprometidos` : formatCommitted(session)
  return (
    <div className="today-hero today-hero--goal" style={goalAccent(goal)}>
      <HeroBand goal={goal} state="Siguiente sesión" meta={pendingTimeLabel(session)} />
      <div className="today-hero__body">
        <span className="today-hero__sub">{committed}</span>
      </div>
      <div className="today-hero__actions">
        <button type="button" className="btn btn--primary today-hero__cta" onClick={onStart}>
          <IconPlay size={16} /> Empezar sesión
        </button>
      </div>
    </div>
  )
}

/** Cierre del día dicho sin culpa: todo, nada o cuántas se cumplieron. */
function dayClosedTitle(done: number, total: number): string {
  if (done === total) return 'Cumpliste tu compromiso de hoy.'
  if (done === 0) return 'Hoy no pudiste. Mañana se empieza de nuevo.'
  return `Cerraste el día: ${done} de ${total} ${done === 1 ? 'cumplida' : 'cumplidas'}.`
}

function HeroDayClosed({ done, total, spontaneous }: Readonly<{ done: number; total: number; spontaneous: SpontaneousProps }>) {
  const complete = done === total
  return (
    <div className="today-hero">
      <div className="today-hero__top">
        {/* Estado del día: verde si se cumplió todo; neutro si no (sin culpa). */}
        <span className={`chip-state${complete ? ' chip-state--ok' : ''}`}>
          {complete && <IconCheck size={12} />}
          Compromiso de hoy
        </span>
      </div>
      <span className="today-hero__title">{dayClosedTitle(done, total)}</span>
      <SpontaneousSession {...spontaneous} />
    </div>
  )
}

function HeroFreeDay({ spontaneous }: Readonly<{ spontaneous: SpontaneousProps }>) {
  return (
    <div className="today-hero">
      <div className="today-hero__top">
        <span className="today-hero__state">
          <span className="today-hero__dot" aria-hidden="true" />
          {'Día libre'}
        </span>
      </div>
      <span className="today-hero__title">Hoy no comprometiste sesiones.</span>
      <SpontaneousSession {...spontaneous} />
    </div>
  )
}

function HeroEmpty({ onIdeas, onNewGoal }: Readonly<{ onIdeas: () => void; onNewGoal: () => void }>) {
  return (
    <div className="today-hero today-hero--empty">
      <PathIllustration width={180} done={1} className="today-hero__art" />
      <div className="today-hero__top">
        <span className="today-hero__state">Empieza aquí</span>
      </div>
      <span className="today-hero__title">Tu día se arma alrededor de una meta.</span>
      <div className="today-hero__actions">
        <button type="button" className="btn btn--primary today-hero__cta" onClick={onIdeas}>
          Ver ideas para empezar
        </button>
      </div>
      <button type="button" className="btn--link today-hero__link" onClick={onNewGoal}>
        Escribir mi propia meta
      </button>
    </div>
  )
}

interface SpontaneousProps {
  picking: boolean
  goals: Goal[]
  onOpen: () => void
  onPick: (goal: Goal) => void
}

/** Botón (o selector de meta) para sumar una sesión espontánea al día. */
function SpontaneousSession({ picking, goals, onOpen, onPick }: Readonly<SpontaneousProps>) {
  if (!picking) {
    return (
      <div className="today-hero__actions">
        <button type="button" className="today-hero__ghost" onClick={onOpen}>
          <IconPlus size={16} /> Sesión espontánea
        </button>
      </div>
    )
  }
  return (
    <div className="row wrap">
      {goals.map((g) => (
        <button key={g.id} type="button" className="chip today-spont" onClick={() => onPick(g)}>
          <NicheGlyph area={g.area} tone={goalTone(g)} size="sm" /> {g.title}
        </button>
      ))}
    </div>
  )
}

interface NextStepProps {
  running: Session | null
  pending: Session | null
  goal: Goal | undefined
  stage: StageProgress | undefined
  now: Date
  allResolved: boolean
  doneCount: number
  sessionCount: number
  spontaneous: SpontaneousProps
  onContinue: (session: Session) => void
  onStop: (session: Session) => void
  onStart: (session: Session) => void
  onIdeas: () => void
  onNewGoal: () => void
}

/**
 * El héroe: una sola tarjeta con el primer paso del día. En orden: la sesión
 * en curso, la siguiente pendiente, el cierre del día, el día libre o, sin
 * metas activas, la invitación a crear la primera.
 */
export function NextStep(props: Readonly<NextStepProps>) {
  const { running, pending, goal, spontaneous } = props
  if (running && goal) {
    return (
      <HeroRunning
        session={running}
        goal={goal}
        stage={props.stage}
        now={props.now}
        onContinue={() => props.onContinue(running)}
        onStop={() => props.onStop(running)}
      />
    )
  }
  if (pending && goal) return <HeroPending session={pending} goal={goal} onStart={() => props.onStart(pending)} />
  if (props.allResolved) {
    return <HeroDayClosed done={props.doneCount} total={props.sessionCount} spontaneous={spontaneous} />
  }
  if (spontaneous.goals.length > 0) return <HeroFreeDay spontaneous={spontaneous} />
  return <HeroEmpty onIdeas={props.onIdeas} onNewGoal={props.onNewGoal} />
}

interface QuickNoteProps {
  text: string
  onChange: (text: string) => void
  onSave: () => void
  onSkip: () => void
}

/** Tras un ✓ rápido: "¿Qué lograste?" para que el diario de la meta no quede vacío. */
export function QuickNote({ text, onChange, onSave, onSkip }: Readonly<QuickNoteProps>) {
  // Al aparecer, el foco va al campo para escribir de inmediato (sin autoFocus en el JSX).
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => inputRef.current?.focus(), [])
  return (
    <div className="today-note">
      <label className="field__label" htmlFor="quick-note">
        ¿Qué lograste? (opcional)
      </label>
      <div className="row">
        <input
          id="quick-note"
          ref={inputRef}
          className="input"
          maxLength={200}
          placeholder="Ej: terminé el capítulo 3…"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave()
            if (e.key === 'Escape') onSkip()
          }}
        />
        <button className="btn btn--sm btn--primary" onClick={onSave}>
          Guardar
        </button>
        <button className="btn btn--sm btn--subtle" onClick={onSkip}>
          Omitir
        </button>
      </div>
    </div>
  )
}
