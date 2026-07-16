import { useCallback, useEffect, useState } from 'react'
import { friendlyError } from '@/lib/errors'
import { sessionCache } from '@/lib/sessionCache'

export interface CachedData<T> {
  data: T | null
  /** true SOLO en carga en frío (sin cache) → mostrar skeleton. */
  loading: boolean
  /** true mientras revalida por detrás con datos ya en pantalla. */
  refreshing: boolean
  /** error a pantalla completa SOLO si falla la carga en frío. */
  error: string | null
  reload: () => void
  /** Actualiza estado + cache sin ir a la red (tras editar/marcar). */
  mutate: (updater: (prev: T | null) => T) => void
}

/**
 * Carga datos con cache en memoria + stale-while-revalidate:
 *  - Hay cache para `key` → pinta al instante (loading=false) y revalida por detrás.
 *  - No hay cache → loading=true (skeleton), carga y guarda.
 * Si la revalidación falla con datos ya cacheados, se conservan (no se pisa con error).
 * `deps` controla cuándo se re-ejecuta el loader (igual que useAsyncData).
 */
export function useCachedData<T>(
  key: string,
  loader: () => Promise<T>,
  deps: unknown[],
): CachedData<T> {
  const [data, setData] = useState<T | null>(() => sessionCache.get<T>(key) ?? null)
  const [loading, setLoading] = useState(() => sessionCache.get<T>(key) === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Si cambia la clave sin desmontar (p. ej. otro goalId en GoalDetail), re-sincroniza
  // el estado desde el cache durante el render — patrón oficial de React para estado
  // derivado de props (evita mostrar por un instante los datos de la clave anterior).
  const [renderedKey, setRenderedKey] = useState(key)
  if (key !== renderedKey) {
    setRenderedKey(key)
    const cached = sessionCache.get<T>(key)
    setData(cached ?? null)
    setLoading(cached === undefined)
    setRefreshing(false)
    setError(null)
  }

  // El loader lo memoiza el caller vía deps explícitas (hook genérico, igual que
  // useAsyncData): el linter no puede verificarlas estáticamente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  useEffect(() => {
    let active = true
    const hadCache = sessionCache.get<T>(key) !== undefined
    if (hadCache) {
      setRefreshing(true)
    } else {
      setLoading(true)
      setError(null)
    }
    run()
      .then((result) => {
        if (!active) return
        sessionCache.set(key, result)
        setData(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        // Con datos ya en pantalla, conservarlos: no romper con un error de fondo.
        if (!hadCache) {
          setError(friendlyError(err, 'No se pudieron cargar los datos. Inténtalo de nuevo.'))
        }
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => {
      active = false
    }
    // key va en deps para revalidar si cambia; run cubre las deps del caller.
  }, [run, reloadKey, key])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const mutate = useCallback(
    (updater: (prev: T | null) => T) => {
      setData((prev) => {
        const next = updater(prev)
        sessionCache.set(key, next)
        return next
      })
    },
    [key],
  )

  return { data, loading, refreshing, error, reload, mutate }
}
