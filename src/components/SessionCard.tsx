import type { Goal, Session } from '@/lib/types'
import { getTemplate } from '@/domain/templates'
import { nicheAccent } from '@/lib/nicheAccent'
import { IconPlay } from '@/components/icons'

interface SessionCardProps {
  session: Session
  goal: Goal
  /** Idea de contenido para llenar la sesión (pickSuggestion). */
  suggestion: string
  /** Abrir la pantalla de sesión (cronómetro / contador). */
  onOpen: () => void
  /** Check rápido sin cronómetro: la doy por hecha completa. */
  onQuickDone: () => void
  /** Deshacer un cierre (volver a pendiente). */
  onReopen: () => void
}

function targetLabel(s: Session): string {
  return s.targetKind === 'time' ? `${s.targetValue} min` : `${s.targetValue} ${s.unit ?? ''}`.trim()
}

function clock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function SessionCard({ session, goal, suggestion, onOpen, onQuickDone, onReopen }: SessionCardProps) {
  const template = getTemplate(goal.templateKey)
  const closed = session.status === 'done' || session.status === 'partial' || session.status === 'missed'

  if (closed) {
    const label =
      session.status === 'done'
        ? `Hecha${session.endedAt ? ` ${clock(session.endedAt)}` : ''}`
        : session.status === 'partial'
          ? `Parcial · ${session.actualValue ?? 0} de ${targetLabel(session)}`
          : 'Hoy no pudiste — está bien'
    return (
      <div className={`session session--${session.status}`} style={nicheAccent(goal.area)}>
        <div className="session__body">
          <span className="session__title session__title--closed">
            {template.emoji} {goal.title} · {targetLabel(session)}
          </span>
          <span className={`session__meta${session.status === 'done' ? ' session__meta--ok' : ''}`}>
            {label}
          </span>
        </div>
        <button
          type="button"
          className="btn--link session__undo"
          onClick={onReopen}
          aria-label={`Deshacer el cierre de la sesión de ${goal.title}`}
        >
          Deshacer
        </button>
      </div>
    )
  }

  const running = session.status === 'running' || session.status === 'unconfirmed'
  return (
    <div className="session" style={nicheAccent(goal.area)}>
      <div className="session__body">
        <span className="session__title">
          {template.emoji} {goal.title} · {targetLabel(session)}
        </span>
        <span className="session__meta">
          {running
            ? session.status === 'unconfirmed'
              ? 'Quedó sin confirmar — cuéntame cómo te fue'
              : 'En curso'
            : `${session.plannedTime ? `${session.plannedTime} · ` : ''}Idea: ${suggestion}`}
        </span>
        {goal.why && !running && <span className="session__why">“{goal.why}”</span>}
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
            onClick={onQuickDone}
            aria-label={`Marcar la sesión de ${goal.title} como hecha sin cronómetro`}
          />
        )}
      </div>
    </div>
  )
}
