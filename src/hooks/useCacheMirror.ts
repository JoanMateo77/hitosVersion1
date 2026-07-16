import { useEffect } from 'react'
import { sessionCache } from '@/lib/sessionCache'

/**
 * Refleja en `sessionCache` la instantánea actual de datos de una pantalla, para que
 * al volver se pinte al instante (stale-while-revalidate; ver sessionCache).
 *
 * Pensado para pantallas con mucho estado y handlers de mutación optimista: en vez de
 * reescribir su carga, la pantalla inicializa sus useState leyendo `sessionCache.get(key)`
 * en el primer render, y este hook mantiene el cache al día con lo que se muestra
 * (incluidos los cambios optimistas). Guarda en cada commit mientras `ready` sea true;
 * un `Map.set` es O(1), así que reflejar en cada render es barato.
 */
export function useCacheMirror<T>(key: string, ready: boolean, snapshot: T): void {
  useEffect(() => {
    if (ready) sessionCache.set(key, snapshot)
  })
}
