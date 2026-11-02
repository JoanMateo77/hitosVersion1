import { useEffect } from 'react'
import { PathIllustration } from '@/components/PathIllustration'
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
      {/* El camino completo con su banderín: la ilustración del logro. Las
          etapas toman el color del área cuando hay una meta en contexto
          (--vivid heredado); si no, quedan neutras. */}
      <PathIllustration
        width={180}
        done={3}
        stopColor="var(--vivid, var(--text-muted))"
        className="celebrate-pop won__art"
      />
      <strong className="won__title">{title}</strong>
    </div>
  )
}
