import { useEffect, useRef } from 'react'

/**
 * Llama a `onReturn` cada vez que la app vuelve al frente (la persona regresa
 * de otra app o desbloquea el teléfono). Sirve para recargar datos que otro
 * dispositivo pudo cambiar mientras tanto.
 */
export function useOnAppReturn(onReturn: () => void) {
  const ref = useRef(onReturn)
  useEffect(() => {
    ref.current = onReturn
  })
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ref.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
}
