import type { ReactNode } from 'react'

interface SessionRingProps {
  /** Progreso 0..1 del anillo. */
  progress: number
  /** Contenido del centro (tiempo restante, contador…). */
  children: ReactNode
}

const R = 80
const CIRCUMFERENCE = 2 * Math.PI * R

/** Anillo de progreso de la sesión en curso (cronómetro / contador). */
export function SessionRing({ progress, children }: SessionRingProps) {
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <div className="ring">
      <svg viewBox="0 0 180 180" className="ring__svg" aria-hidden="true">
        <circle cx="90" cy="90" r={R} className="ring__track" />
        <circle
          cx="90"
          cy="90"
          r={R}
          className="ring__bar"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
        />
      </svg>
      <div className="ring__center">{children}</div>
    </div>
  )
}
