import { useSession } from '@/app/session'
import { fetchCurrentStreak } from '@/services/profile'
import { frameForStreak, type Frame } from '@/domain/frames'
import { useCachedData } from '@/hooks/useCachedData'

export interface StreakFrame {
  /** Racha actual (días comprometidos cumplidos); 0 mientras carga o si falla. */
  streak: number
  /** Marco ganado con esa racha, o null si aún no gana ninguno. */
  frame: Frame | null
}

/**
 * Racha actual del usuario y su marco. Misma clave de cache en todas las
 * superficies (barra superior, barra lateral, Perfil): un solo cálculo por
 * sesión. Tolerante a errores: si falla, la racha queda en 0 y no hay anillo.
 */
export function useStreakFrame(): StreakFrame {
  const { userId } = useSession()
  const { data } = useCachedData(
    `streak:${userId}`,
    () => fetchCurrentStreak(userId).catch(() => 0),
    [userId],
  )
  const streak = data ?? 0
  return { streak, frame: frameForStreak(streak) }
}
