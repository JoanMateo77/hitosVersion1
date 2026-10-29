import type { ReactNode } from 'react'
import type { Goal, Session } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'
import { tapHaptic } from '@/lib/haptics'
import { rangeLabel, sessionSpan } from '@/domain/agenda'
import { formatTime12 } from '@/lib/date'
import { IconPlay } from '@/components/icons'
import { NicheIcon } from '@/components/NicheGlyph'

interface SessionCardProps {
  session: Session
  goal: Goal
  /** Abrir la pantalla de sesión (cronómetro / contador). */
  onOpen: () => void
  /** Check rápido sin cronómetro: la doy por hecha completa. */
  onQuickDone: () => void
  /** Deshacer un cierre de una hecha (volver a pendiente). */
  onReopen: () => void
  /** Retomar una sesión parcial/no completada: el reloj sigue donde quedó. */
  onResume: () => void
}

function targetLabel(s: Session): string {
  return s.targetKind === 'time' ? `${s.targetValue} min` : `${s.targetValue} ${s.unit ?? ''}`.trim()
}

function clock(iso: string): string {
  const d = new Date(iso)
  return formatTime12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}

/**
 * Pista de la sesión pendiente: el rango de horas (o el objetivo si no hay
 * rango completo). El porqué y la idea de contenido viven en la pantalla de
 * sesión, no aquí.
 */
function sessionHint(s: Session): string {
  const span = sessionSpan(s.plannedTime, s.targetKind, s.targetValue)
  const parts: string[] = []
  if (span.start) parts.push(rangeLabel(span.start, span.end))
  // En sesiones de tiempo con rango completo, "25 min" ya se lee en las horas.
  if (!(s.targetKind === 'time' && span.end)) parts.push(targetLabel(s))
  return parts.join(' · ')
}

/** Texto de una sesión en curso, en pausa o sin confirmar. */
function runningLabel(session: Session): string {
  if (session.status === 'unconfirmed') return 'Quedó sin confirmar — cuéntame cómo te fue'
  return session.pausedAt ? 'En pausa' : 'En curso'
}

/** Texto de estado de una sesión ya cerrada. */
function closedLabel(session: Session): string {
  switch (session.status) {
    case 'done':
      return `Hecha${session.endedAt ? ` ${clock(session.endedAt)}` : ''}`
    case 'skipped':
      return 'Saltada'
    case 'partial':
      return `Parcial · ${session.actualValue ?? 0} de ${targetLabel(session)}`
    default:
      return 'Sin cumplir'
  }
}

export function SessionCard({ session, goal, onOpen, onQuickDone, onReopen, onResume }: SessionCardProps) {
  const closed =
    session.status === 'done' ||
    session.status === 'partial' ||
    session.status === 'missed' ||
    session.status === 'skipped'
  // Hecha: se deshace (vuelve a pendiente). Parcial o sin cumplir: se retoma.
  // Saltada: solo se lee; el salto se deshace desde la Agenda (unskipSession).
  const undoable = session.status === 'done'

  if (closed) {
    const label = closedLabel(session)
    let action: ReactNode = null
    if (undoable) {
      action = (
        <button
          type="button"
          className="btn--link session__undo"
          onClick={onReopen}
          aria-label={`Deshacer el cierre de la sesión de ${goal.title}`}
        >
          Deshacer
        </button>
      )
    } else if (session.status !== 'skipped') {
      action = (
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          style={{ flex: 'none' }}
          onClick={onResume}
          aria-label={`Retomar la sesión de ${goal.title} donde quedó`}
        >
          <IconPlay size={13} /> Retomar
        </button>
      )
    }
    return (
      <div className={`session session--${session.status}`} style={nicheAccent(goal.area)}>
        <div className="session__body">
          <span className="session__title row row--sm">
            <NicheIcon area={goal.area} size={16} className="session__icon" />
            <span className="nowrap-ellipsis session__title--closed">{goal.title}</span>
          </span>
          <span className={`session__meta${session.status === 'done' ? ' session__meta--ok' : ''}`}>
            {label}
          </span>
        </div>
        {action}
      </div>
    )
  }

  const running = session.status === 'running' || session.status === 'unconfirmed'
  return (
    <div className="session" style={nicheAccent(goal.area)}>
      <div className="session__body">
        <span className="session__title row row--sm">
          <NicheIcon area={goal.area} size={16} className="session__icon" />
          <span className="nowrap-ellipsis">{goal.title}</span>
        </span>
        <span className="session__meta">
          {running ? runningLabel(session) : sessionHint(session)}
        </span>
      </div>
      <div className="session__actions">
        <button
          type="button"
          className="session__play"
          onClick={onOpen}
          aria-label={
            running ? `Continuar la sesión de ${goal.title}` : `Empezar la sesión de ${goal.title}`
          }
        >
          <IconPlay size={18} />
        </button>
        {!running && (
          <button
            type="button"
            className="check session__quick"
            onClick={() => {
              // El check rápido siempre marca (la sesión abierta pasa a hecha).
              tapHaptic()
              onQuickDone()
            }}
            aria-label={`Marcar la sesión de ${goal.title} como hecha sin cronómetro`}
          />
        )}
      </div>
    </div>
  )
}
