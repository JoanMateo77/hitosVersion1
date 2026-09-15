import { useCallback, useEffect, useRef, useState } from 'react'

/** Debe coincidir con la duración de `.cheer--leaving` en components.css. */
const LEAVE_MS = 160

/**
 * Micro-celebraciones: una sola frase efímera que aparece y se va sola.
 * La idea es palmear la espalda sin spam — no modales, no toasts persistentes,
 * sólo un texto que respira en el lugar correcto.
 *
 * Sale en dos tiempos: `cheerLeaving` se enciende 160 ms antes del final para
 * que la frase se vaya animada en vez de desaparecer de golpe.
 */
export function useCheer(durationMs = 3200) {
  const [cheerMessage, setCheerMessage] = useState<string | null>(null)
  const [cheerLeaving, setCheerLeaving] = useState(false)
  const timer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)

  const cheer = useCallback(
    (text: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
      setCheerMessage(text)
      setCheerLeaving(false)
      leaveTimer.current = window.setTimeout(
        () => setCheerLeaving(true),
        Math.max(0, durationMs - LEAVE_MS),
      )
      timer.current = window.setTimeout(() => {
        setCheerMessage(null)
        setCheerLeaving(false)
      }, durationMs)
    },
    [durationMs],
  )

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    }
  }, [])

  return { cheerMessage, cheerLeaving, cheer }
}
