import { useEffect } from 'react'
import { IconCelebrate } from '@/components/icons'
import { successHaptic } from '@/lib/haptics'

interface CelebrationProps {
  /** Lo que se logró, en una línea. */
  title: string
  /** Se llama cuando la celebración terminó de salir (para limpiar el estado). */
  onDone: () => void
}

/**
 * El momento focal de la app: lograr una meta. Un velo que cubre la pantalla
 * por un par de segundos, se va solo y no bloquea nada (`pointer-events: none`).
 *
 * Se va por su propia animación (`won-out`), no por un temporizador: si el
 * usuario tiene reduced-motion la regla global la acorta y `onDone` llega igual.
 */
export function Celebration({ title, onDone }: CelebrationProps) {
  useEffect(() => {
    successHaptic()
  }, [])

  return (
    <div
      className="won"
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        // Solo la salida del propio velo cierra: el pop del ícono también burbujea.
        if (e.animationName === 'won-out' && e.target === e.currentTarget) onDone()
      }}
    >
      <span className="celebrate-pop won__icon">
        <IconCelebrate size={64} />
      </span>
      <strong className="won__title">{title}</strong>
    </div>
  )
}
