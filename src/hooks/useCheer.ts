import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Micro-celebraciones: una sola frase efímera que aparece y se va sola.
 * La idea es palmear la espalda sin spam — no modales, no toasts persistentes,
 * sólo un texto que respira en el lugar correcto.
 */
export function useCheer(durationMs = 3200) {
  const [cheerMessage, setCheerMessage] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const cheer = useCallback(
    (text: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      setCheerMessage(text)
      timer.current = window.setTimeout(() => setCheerMessage(null), durationMs)
    },
    [durationMs],
  )

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  return { cheerMessage, cheer }
}
