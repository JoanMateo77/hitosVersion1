import type { NicheId } from '@/lib/types'
import { DAY_AREAS, type DayArea } from '@/domain/dayPlan'

/**
 * Área (y por tanto color) de un evento o tarea sin meta. Usa la que tiene
 * guardada; si no tiene (datos de antes de la migración 0022) o es 'otra',
 * elige una de la paleta según el título, siempre la misma para el mismo
 * título. Nunca devuelve 'otra': lo suelto no se pinta gris.
 */
export function looseArea(title: string, area: NicheId | null | undefined): DayArea {
  if (area && area !== 'otra') return area
  let hash = 0
  for (const ch of title.trim().toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) | 0
  return DAY_AREAS[Math.abs(hash) % DAY_AREAS.length]
}
