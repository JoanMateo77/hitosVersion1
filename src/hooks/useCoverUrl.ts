import { useEffect, useState } from 'react'
import { coverUrl } from '@/services/goalCovers'

/** URL firmada de una portada (o null mientras carga, si falla o si no hay foto). */
export function useCoverUrl(path: string | null): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    coverUrl(path)
      .then((url) => {
        if (alive) setResolved({ path, url })
      })
      .catch(() => {
        // Sin foto la superficie conserva el color de la meta: nada que avisar.
      })
    return () => {
      alive = false
    }
  }, [path])
  return resolved && resolved.path === path ? resolved.url : null
}
