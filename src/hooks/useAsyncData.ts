import { useCallback, useEffect, useState } from 'react'
import { friendlyError } from '@/lib/errors'

export interface AsyncData<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Carga datos asíncronos con manejo de carga/error y cancelación segura.
 * `deps` controla cuándo se vuelve a ejecutar (igual que un useEffect).
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Memoiza el loader según las deps explícitas que pasa el caller. Es un hook
  // genérico: las deps las controla quien lo usa (igual que un useEffect), así
  // que el linter no puede verificarlas estáticamente — es el patrón esperado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    run()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((err: unknown) => {
        if (active) setError(friendlyError(err, 'No se pudieron cargar los datos. Inténtalo de nuevo.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [run, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { data, loading, error, reload }
}
