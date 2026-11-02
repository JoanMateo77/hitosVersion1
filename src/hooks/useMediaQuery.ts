import { useSyncExternalStore } from 'react'

/** true mientras la media query se cumple; se actualiza al redimensionar. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Mismo corte que el CSS de escritorio (components.css, min-width: 1024px). */
export const DESKTOP_QUERY = '(min-width: 1024px)'
