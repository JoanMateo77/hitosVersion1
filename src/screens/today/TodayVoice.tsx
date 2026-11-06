import type { ReactNode } from 'react'
import type { Goal } from '@/lib/types'
import type { useNovedades } from '@/hooks/useNovedades'
import {
  IconCelebrate,
  IconChevronRight,
  IconClock,
  IconFlame,
  IconLightbulb,
  IconQuote,
  IconSprout,
} from '@/components/icons'

type Novedad = NonNullable<ReturnType<typeof useNovedades>['novedad']>

/** Fila informativa con glifo, título, detalle y, si hay, una acción a la derecha. */
function VoiceRow({
  glyph,
  title,
  sub,
  action,
}: Readonly<{ glyph: ReactNode; title: ReactNode; sub: ReactNode; action: ReactNode }>) {
  return (
    <output className="today-row">
      <span className="today-row__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="today-row__text">
        <span className="today-row__title">{title}</span>
        <span className="today-row__sub">{sub}</span>
      </span>
      {action}
    </output>
  )
}

/** Fila que lleva a otra pantalla. */
function VoiceLink({
  glyph,
  title,
  sub,
  onOpen,
}: Readonly<{ glyph: ReactNode; title: ReactNode; sub: ReactNode; onOpen: () => void }>) {
  return (
    <button type="button" className="today-row today-row--link" onClick={onOpen}>
      <span className="today-row__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="today-row__text">
        <span className="today-row__title">{title}</span>
        <span className="today-row__sub">{sub}</span>
      </span>
      <IconChevronRight size={16} className="today-row__chev" />
    </button>
  )
}

function ForgottenRow({
  goal,
  days,
  onSessionToday,
  onPause,
  onAccept,
}: Readonly<{ goal: Goal; days: number; onSessionToday: () => void; onPause: () => void; onAccept: () => void }>) {
  return (
    <div className="today-row today-row--stack">
      <span className="today-row__glyph" aria-hidden="true">
        <IconSprout size={16} />
      </span>
      <span className="today-row__text">
        <span className="today-row__title">
          Hace {days} días sin {goal.title}
        </span>
        <span className="today-row__sub">¿La retomas o la pausas?</span>
        <span className="today-row__actions">
          <button className="btn--link" onClick={onSessionToday}>
            Sesión hoy
          </button>
          <button className="btn--link" onClick={onPause}>
            Pausar
          </button>
          <button className="btn--link" onClick={onAccept}>
            Está bien así
          </button>
        </span>
      </span>
    </div>
  )
}

interface TodayVoiceProps {
  novedad: Novedad | null
  onCloseNovedad: () => void
  cheerMessage: string | null
  cheerLeaving: boolean
  /** Racha recién rota cuyo aviso todavía no se cerró. */
  streakBroken: { best: number } | null
  onDismissStreak: () => void
  /** Sesión de otro día que quedó sin confirmar, con el título de su meta. */
  toResolve: { goalTitle: string | undefined } | null
  onResolve: () => void
  reviewCount: number
  onReview: () => void
  forgotten: { goal: Goal; days: number } | null
  onForgottenSession: (goal: Goal) => void
  onForgottenPause: (goal: Goal) => void
  onForgottenAccept: (goal: Goal) => void
}

/**
 * UNA sola voz por vista. Prioridad: consecuencia de una acción del usuario
 * (celebración, racha rota) > pregunta que la app necesita (sin confirmar,
 * revisión, olvidada). Las tareas pendientes de ayer no compiten por esta
 * voz: viven en la lista de "Más tarde hoy".
 */
export function TodayVoice(props: Readonly<TodayVoiceProps>) {
  const { novedad, cheerMessage, streakBroken, toResolve, forgotten } = props
  if (novedad) {
    return (
      <VoiceRow
        glyph={<IconLightbulb size={16} />}
        title={<>Novedades · {novedad.titulo}</>}
        sub={novedad.items[0]}
        action={
          <button className="btn--link today-row__action" onClick={props.onCloseNovedad}>
            Entendido
          </button>
        }
      />
    )
  }
  if (cheerMessage) {
    return (
      <div className={`today-row cheer${props.cheerLeaving ? ' cheer--leaving' : ''}`} role="status" aria-live="polite">
        <span className="today-row__glyph" aria-hidden="true">
          <IconCelebrate size={16} />
        </span>
        <span className="today-row__text">
          <span className="today-row__title">{cheerMessage}</span>
        </span>
      </div>
    )
  }
  if (streakBroken) {
    return (
      <VoiceRow
        glyph={<IconFlame size={16} />}
        title="Tu racha se reinició"
        sub={<>Récord: {streakBroken.best} días. Hoy se empieza otra.</>}
        action={
          <button className="btn--link today-row__action" onClick={props.onDismissStreak}>
            Entendido
          </button>
        }
      />
    )
  }
  if (toResolve) {
    return (
      <VoiceLink
        glyph={<IconClock size={16} />}
        title="Quedó una sesión abierta"
        sub={<>{toResolve.goalTitle} · ¿Cómo te fue?</>}
        onOpen={props.onResolve}
      />
    )
  }
  if (props.reviewCount > 0) {
    return (
      <VoiceLink
        glyph={<IconQuote size={16} />}
        title="Revisión guiada"
        sub={
          <>
            {props.reviewCount} {props.reviewCount === 1 ? 'meta lista' : 'metas listas'} para revisar · 3 min
          </>
        }
        onOpen={props.onReview}
      />
    )
  }
  if (forgotten) {
    return (
      <ForgottenRow
        goal={forgotten.goal}
        days={forgotten.days}
        onSessionToday={() => props.onForgottenSession(forgotten.goal)}
        onPause={() => props.onForgottenPause(forgotten.goal)}
        onAccept={() => props.onForgottenAccept(forgotten.goal)}
      />
    )
  }
  return null
}
