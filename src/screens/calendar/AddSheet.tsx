import { formatWeekday } from '@/lib/date'
import { IconCalendar, IconClose, IconPlay } from '@/components/icons'
import { Sheet } from '@/components/Sheet'

/** Hoja del "+": un evento propio o una sesión espontánea para una meta. */
export function AddSheet({
  date,
  canPlanSession,
  onEvent,
  onSession,
  onClose,
}: {
  date: string
  /** Solo hoy/futuro con metas activas. */
  canPlanSession: boolean
  onEvent: () => void
  onSession: () => void
  onClose: () => void
}) {
  return (
    <Sheet onClose={onClose} label="¿Qué agregas?">
      {(close) => (
        <>
          <div className="row row--between">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿Qué agregas?</h2>
            <button type="button" className="iconbtn iconbtn--sm" onClick={close} aria-label="Cerrar">
              <IconClose />
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Para el {formatWeekday(date)}.
          </p>
          <div className="stack stack--sm">
            <button type="button" className="btn btn--ghost btn--block" onClick={onEvent}>
              <IconCalendar size={16} /> Evento
            </button>
            {canPlanSession && (
              <button type="button" className="btn btn--ghost btn--block" onClick={onSession}>
                <IconPlay size={16} /> Sesión para una meta
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}
