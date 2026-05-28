import { useCallback, useState } from 'react'

const PREFIX = 'hito.hint.'

/**
 * Hints "primera vez" persistidos en localStorage. La idea: la app se explica
 * sola con texto contextual que aparece una sola vez por dispositivo.
 *
 * Reglas: nunca tour, nunca modal, nunca obligatorio. El usuario lo descarta
 * y no vuelve a verlo. Cada hint tiene un id único; cambiar el id "resetea" para
 * todos los usuarios (útil cuando reescribimos un microcopy).
 */
export function useFirstTimeHint(id: string): {
  visible: boolean
  dismiss: () => void
} {
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(id))
  const dismiss = useCallback(() => {
    writeDismissed(id)
    setDismissed(true)
  }, [id])
  return { visible: !dismissed, dismiss }
}

function readDismissed(id: string): boolean {
  try {
    return localStorage.getItem(PREFIX + id) === '1'
  } catch {
    return false
  }
}

function writeDismissed(id: string): void {
  try {
    localStorage.setItem(PREFIX + id, '1')
  } catch {
    /* ignore */
  }
}
