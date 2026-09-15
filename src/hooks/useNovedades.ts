import { useCallback, useState } from 'react'
import { NOVEDADES } from '@/content/novedades'
import { novedadPendiente } from '@/domain/novedades'
import { safeGetItem, safeSetItem } from '@/lib/storage'

const KEY = 'logralo.novedades.vista'

/** El aviso de novedades vigente y su cierre (persistido por dispositivo). */
export function useNovedades() {
  const [vistaId, setVistaId] = useState<string | null>(() => safeGetItem(KEY))
  const novedad = novedadPendiente(NOVEDADES, vistaId)
  const cerrar = useCallback(() => {
    if (!novedad) return
    safeSetItem(KEY, novedad.id)
    setVistaId(novedad.id)
  }, [novedad])
  return { novedad, cerrar }
}
