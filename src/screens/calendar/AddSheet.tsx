import { useEffect, useRef } from 'react'
import { formatWeekday } from '@/lib/date'
import { IconCalendar, IconClose, IconPlay } from '@/components/icons'
import { useFocusTrap } from '@/hooks/useFocusTrap'

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
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet__backdrop" onClick={onClose} />
      <div ref={panelRef} className="sheet__panel stack stack--lg">
        <div className="row row--between">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿Qué agregas?</h2>
          <button type="button" className="iconbtn iconbtn--sm" onClick={onClose} aria-label="Cerrar">
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
      </div>
    </div>
  )
}
