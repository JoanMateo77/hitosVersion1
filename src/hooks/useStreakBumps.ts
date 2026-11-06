import { useState } from 'react'

/**
 * La racha sube: la llama late y el número entra desde abajo (.fc-bump), SOLO
 * cuando el valor sube con la pantalla abierta. La carga inicial no cuenta
 * como cambio: se toma como punto de partida el primer valor ya cargado.
 * Devuelve cuántas subidas hubo (sirve de `key` para reiniciar la animación).
 */
export function useStreakBumps(streak: number, loading: boolean): number {
  const [streakSeen, setStreakSeen] = useState<number | null>(loading ? null : streak)
  const [streakBumps, setStreakBumps] = useState(0)
  if (!loading && streak !== streakSeen) {
    if (streakSeen !== null && streak > streakSeen) setStreakBumps((n) => n + 1)
    setStreakSeen(streak)
  }
  return streakBumps
}
