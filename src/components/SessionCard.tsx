import type { Goal, Session } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'
import { rangeLabel, sessionSpan } from '@/domain/agenda'
import { formatTime12 } from '@/lib/date'
import { IconPlay } from '@/components/icons'
import { NicheIcon } from '@/components/NicheGlyph'

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
  /** Retomar una sesión parcial/no completada: el reloj sigue donde quedó. */
  onResume: () => void
  /** Eventos de la agenda vinculados a la meta hoy (el plan del bloque). */
  plan?: { done: number; total: number }
}

function targetLabel(s: Session): string {
  return s.targetKind === 'time' ? `${s.targetValue} min` : `${s.targetValue} ${s.unit ?? ''}`.trim()
}

function clock(iso: string): string {
  const d = new Date(iso)
  return formatTime12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}

/**
 * Pista de la sesión pendiente: rango de horas (el mismo idioma que la
 * agenda), el objetivo cuando el rango no lo lleva ya implícito, y, si hay
 * cosas agendadas para la meta hoy, el plan le gana a la idea genérica.
 * El objetivo vive AQUÍ (metadato) y no en el título: una sola jerarquía.
 */
function sessionHint(
  s: Session,
  suggestion: string,
  plan?: { done: number; total: number },
): string {
  const span = sessionSpan(s.plannedTime, s.targetKind, s.targetValue)
  const parts: string[] = []
  if (span.start) parts.push(rangeLabel(span.start, span.end))
  // En sesiones de tiempo con rango completo, "25 min" ya se lee en las horas.
  if (!(s.targetKind === 'time' && span.end)) parts.push(targetLabel(s))
  parts.push(plan && plan.total > 0 ? `Tu plan: ${plan.done} de ${plan.total}` : `Idea: ${suggestion}`)
  return parts.join(' · ')
}

export function SessionCard({ session, goal, suggestion, onOpen, onQuickDone, onReopen, onResume, plan }: SessionCardProps) {
  const closed = session.status === 'done' || session.status === 'partial' || session.status === 'missed'

  if (closed) {
    const label =
      session.status === 'done'
        ? `Hecha${session.endedAt ? ` ${clock(session.endedAt)}` : ''} · ${targetLabel(session)}`
        : session.status === 'partial'
          ? `Parcial · ${session.actualValue ?? 0} de ${targetLabel(session)}`
          : 'Hoy no pudiste — está bien'
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
        {session.status === 'done' ? (
          <button
            type="button"
            className="btn--link session__undo"
            onClick={onReopen}
            aria-label={`Deshacer el cierre de la sesión de ${goal.title}`}
          >
            Deshacer
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            style={{ flex: 'none' }}
            onClick={onResume}
            aria-label={`Retomar la sesión de ${goal.title} donde quedó`}
          >
            <IconPlay size={13} /> Retomar
          </button>
        )}
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
          {running
            ? session.status === 'unconfirmed'
              ? 'Quedó sin confirmar — cuéntame cómo te fue'
              : session.pausedAt
                ? 'En pausa'
                : 'En curso'
            : sessionHint(session, suggestion, plan)}
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
